


import joblib
import numpy as np
import pandas as pd
import uvicorn
import pennylane as qml
from pennylane import numpy as pnp # Use pennylane's numpy
from sklearn.preprocessing import StandardScaler, normalize
from sklearn.metrics.pairwise import cosine_similarity
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ---- 1. Load Models and Data at Startup ----
SCALER_MODEL_PATH = "quantum_stock_scaler.pkl"
QUANTUM_MATRIX_PATH = "quantum_stock_features.pkl"

try:
    scaler = joblib.load(SCALER_MODEL_PATH)
    data = joblib.load(QUANTUM_MATRIX_PATH)
except FileNotFoundError:
    print("="*80)
    print("ERROR: Model files not found.")
    print(f"Please run your first script to generate '{SCALER_MODEL_PATH}' and '{QUANTUM_MATRIX_PATH}'.")
    print("="*80)
    exit()


quantum_features = data["quantum_features"]
feature_names = data["feature_names"]
df = data["df"]
n_qubits = data["n_qubits"]

# CRITICAL: Convert Date column to string for JSON serialization
# This makes it safe to send to the frontend.
if 'Date' in df.columns:
    df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')

print(f"✅ Models loaded. Ready to serve {len(df)} stock records.")
print(f"🔬 Features: {feature_names}")


# ---- 2. Define Quantum Encoder ----
# This MUST match the encoder used to create the features
dev = qml.device("default.qubit", wires=n_qubits)

@qml.qnode(dev)
def quantum_stock_encoder(x):
    """Quantum feature map: encodes stock features into qubits"""
    qml.templates.AngleEmbedding(x, wires=range(n_qubits))
    weights = pnp.ones((2, n_qubits)) # Use pennylane numpy
    qml.templates.BasicEntanglerLayers(weights=weights, wires=range(n_qubits))
    for i in range(n_qubits):
        qml.RY(0.1 * x[i % len(x)], wires=i)
    return [qml.expval(qml.PauliZ(i)) for i in range(n_qubits)]


# ---- 3. Helper Function to Process New Inputs ----
def encode_new_pattern(open_p, high_p, low_p, close_p):
    """
    Takes raw OHLC prices, preprocesses, and encodes them 
    into a quantum feature vector.
    """
    # 1. Create feature vector from input prices
    input_features = {}
    for feature in feature_names:
        if feature == 'Open':
            input_features[feature] = open_p
        elif feature == 'High':
            input_features[feature] = high_p
        elif feature == 'Low':
            input_features[feature] = low_p
        elif feature == 'Close':
            input_features[feature] = close_p
        elif feature.startswith('padding_'):
            input_features[feature] = 0.0
        else:
            # Approximate calculated features (same logic as your script)
            if feature == 'Returns':
                input_features[feature] = (close_p - open_p) / open_p if open_p != 0 else 0
            elif feature == 'Price_Range':
                input_features[feature] = high_p - low_p
            elif feature == 'Volatility':
                input_features[feature] = ((high_p - low_p) / close_p * 100) if close_p != 0 else 0
            elif feature == 'Daily_Change':
                input_features[feature] = close_p - open_p
            else:
                input_features[feature] = 0.0 # Default for MA_5, Momentum, Gap

    # 2. Convert to array in correct order
    input_vector = np.array([input_features[f] for f in feature_names])

    # 3. Scale and normalize
    input_scaled = scaler.transform(input_vector.reshape(1, -1))
    input_scaled = np.arctan(input_scaled) + np.pi/2
    input_scaled = normalize(input_scaled, norm="l2")

    # 4. Quantum encode
    query_quantum = np.array(quantum_stock_encoder(input_scaled[0]))
    return query_quantum

# ---- 4. Initialize FastAPI App ----
app = FastAPI(
    title="Quantum Stock Pattern Finder API",
    description="API for finding similar historical stock patterns using quantum feature embeddings."
)

# ---- 5. Define API Endpoints ----

@app.get("/api/search/pattern")
def search_by_pattern(
    open_price: float,
    high_price: float,
    low_price: float,
    close_price: float,
    top_k: int = 5
):
    """
    Find historical patterns similar to a new OHLC input.
    """
    try:
        # Encode the new pattern
        query_quantum = encode_new_pattern(open_price, high_price, low_price, close_price)
        
        # Find similar patterns
        sims = cosine_similarity([query_quantum], quantum_features).flatten()
        top_idx = sims.argsort()[::-1][:top_k]
        
        # Format results
        results = []
        for rank, idx in enumerate(top_idx, 1):
            row = df.iloc[idx].to_dict()
            row['Rank'] = rank
            row['Similarity'] = sims[idx]
            results.append(row)
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search/date")
def search_by_date(
    target_date: str = Query(..., description="Date in 'YYYY-MM-DD' format"),
    top_k: int = 5
):
    """
    Find historical patterns similar to a specific date in the dataset.
    """
    # Find the target date (df['Date'] is already a string)
    target_row = df[df['Date'] == target_date]
    
    if target_row.empty:
        raise HTTPException(status_code=404, detail=f"Date {target_date} not found in dataset.")
        
    target_idx = target_row.index[0]
    target_quantum = quantum_features[target_idx]

    # Compute similarity
    sims = cosine_similarity([target_quantum], quantum_features).flatten()
    # +1 to exclude self
    top_idx = sims.argsort()[::-1][:top_k+1] 

    # Format results (skip first as it's the query itself)
    results = []
    for rank, idx in enumerate(top_idx[1:], 1): # Skip self-match
        row = df.iloc[idx].to_dict()
        row['Rank'] = rank
        row['Similarity'] = sims[idx]
        results.append(row)
        
    return results

@app.get("/api/search/volatility")
def get_high_volatility(top_k: int = 10):
    """
    Find days with highest quantum feature variance.
    """
    variances = np.var(quantum_features, axis=1)
    top_idx = variances.argsort()[::-1][:top_k]
    
    results = []
    for rank, idx in enumerate(top_idx, 1):
        row = df.iloc[idx].to_dict()
        row['Rank'] = rank
        row['Variance'] = variances[idx]
        results.append(row)
        
    return results

@app.get("/api/dates")
def get_available_dates():
    """
    Get a list of all available dates for the date-search dropdown.
    """
    return df['Date'].tolist()


# ---- 6. Mount Static Files (HTML/CSS/JS) ----
# This serves your `index.html` as the main page
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# Default endpoint to serve index.html
@app.get("/")
def read_root():
    return FileResponse('static/index.html')

# ---- 7. Run the App ----
if __name__ == "__main__":
    print("🚀 Starting FastAPI server at http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)