import os
import json
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "triage_xgb.json")

# Emergency Severity Index (ESI) mapping
# 0: RED (Immediate)
# 1: ORANGE (High risk, <10 mins)
# 2: YELLOW (Urgent, 1 hour)
# 3: GREEN (Less urgent, 2 hours)
# 4: BLUE (Non-urgent, 4 hours)

def generate_synthetic_data(num_samples=2000):
    """
    Generate synthetic triage data based on vital signs.
    """
    np.random.seed(42)
    
    data = []
    
    for _ in range(num_samples):
        # Generate random vitals with some realistic distributions
        hr = int(np.random.normal(80, 20))
        sys_bp = int(np.random.normal(120, 25))
        dia_bp = int(np.random.normal(80, 15))
        spo2 = int(np.random.randint(85, 100))
        temp = round(np.random.normal(98.6, 1.5), 1)
        
        # Simple logic to assign priority based on thresholds
        # This simulates ESI guidelines based on vitals alone
        priority = 4 # Default BLUE
        
        # RED (Life-threatening)
        if hr > 150 or hr < 40 or sys_bp < 80 or spo2 < 90 or temp > 105:
            priority = 0
            
        # ORANGE (High Risk)
        elif (130 < hr <= 150) or (40 <= hr < 50) or (80 <= sys_bp < 90) or (200 < sys_bp) or (90 <= spo2 < 94) or temp > 103:
            priority = 1
            
        # YELLOW (Urgent)
        elif (110 < hr <= 130) or (50 <= hr < 60) or (90 <= sys_bp < 100) or (160 < sys_bp <= 200) or (94 <= spo2 < 96) or temp > 100.4:
            priority = 2
            
        # GREEN (Less urgent - slight abnormalities)
        elif (100 < hr <= 110) or (sys_bp > 140) or temp > 99.5:
            priority = 3
            
        data.append({
            'heart_rate': hr,
            'systolic_bp': sys_bp,
            'diastolic_bp': dia_bp,
            'spo2': spo2,
            'temperature': temp,
            'priority': priority
        })
        
    df = pd.DataFrame(data)
    
    # Ensure directory exists
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    # Save to CSV for reference
    df.to_csv(os.path.join(MODEL_DIR, "synthetic_triage_data.csv"), index=False)
    
    return df

def train_triage_model(force_retrain=False):
    """
    Train the XGBoost model if it doesn't exist, or if force_retrain is True.
    """
    if os.path.exists(MODEL_PATH) and not force_retrain:
        print("✅ XGBoost Triage model already exists. Skipping training.")
        return True
        
    print("⏳ Generating synthetic triage data...")
    df = generate_synthetic_data()
    
    print("⏳ Training XGBoost Triage model...")
    X = df[['heart_rate', 'systolic_bp', 'diastolic_bp', 'spo2', 'temperature']]
    y = df['priority']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Configure XGBoost classifier
    model = xgb.XGBClassifier(
        objective='multi:softprob',
        num_class=5,
        max_depth=4,
        learning_rate=0.1,
        n_estimators=100,
        random_state=42
    )
    
    # Train
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"✅ Model trained successfully. Accuracy on synthetic test set: {acc:.2f}")
    
    # Save
    model.save_model(MODEL_PATH)
    print(f"💾 Model saved to: {MODEL_PATH}")
    
    return True

# Initialize a global model instance to avoid reloading it on every request
_model = None

def _load_model():
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            train_triage_model()
            
        _model = xgb.XGBClassifier()
        _model.load_model(MODEL_PATH)
    return _model

def extract_vital_number(vital_str, default_val=None):
    """
    Helper to extract a vital number from a string like "120/80" or "98%"
    """
    if not vital_str or vital_str == "-":
        return default_val
        
    import re
    # Extract the first valid number
    match = re.search(r'\d+(\.\d+)?', str(vital_str))
    if match:
        return float(match.group())
        
    return default_val

def predict_priority(vitals_dict):
    """
    Predict triage priority given a dictionary of vitals from the frontend API request.
    Returns: (priority_label: str, confidence_score: int)
    """
    try:
        model = _load_model()
        
        # Extract features providing sensible defaults for missing values
        hr_str = vitals_dict.get('hr', '')
        hr = extract_vital_number(hr_str, 80)
        
        bp_str = vitals_dict.get('bp', '')
        # Handle "120/80" format
        sys_bp = 120
        dia_bp = 80
        if '/' in str(bp_str):
            parts = str(bp_str).split('/')
            sys_bp = extract_vital_number(parts[0], 120)
            dia_bp = extract_vital_number(parts[1], 80)
        else:
            sys_bp = extract_vital_number(bp_str, 120)
            
        spo2_str = vitals_dict.get('spo2', '')
        spo2 = extract_vital_number(spo2_str, 98)
        
        temp_str = vitals_dict.get('temp', '')
        temp = extract_vital_number(temp_str, 98.6)
        
        # Create DataFrame matching feature names from training
        input_data = pd.DataFrame([{
            'heart_rate': hr,
            'systolic_bp': sys_bp,
            'diastolic_bp': dia_bp,
            'spo2': spo2,
            'temperature': temp
        }])
        
        # Predict
        # Use predict_proba to get confidence scores
        probs = model.predict_proba(input_data)[0]
        max_prob_idx = np.argmax(probs)
        confidence = int(probs[max_prob_idx] * 100)
        
        # Map back to labels
        priority_map = {0: "RED", 1: "ORANGE", 2: "YELLOW", 3: "GREEN", 4: "BLUE"}
        priority_label = priority_map.get(max_prob_idx, "BLUE")
        
        return priority_label, confidence
        
    except Exception as e:
        print(f"⚠️ Error running XGBoost prediction: {e}")
        # Fallback if model prediction fails
        return "YELLOW", 50
