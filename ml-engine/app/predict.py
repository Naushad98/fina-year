import os
import sys
sys.path.append(os.path.dirname(__file__))

import joblib
import numpy as np
import pandas as pd
from preprocess import engineer_features

# Paths
MODELS_DIR = os.path.join(os.path.dirname(__file__), '../models')
IFOREST_PATH = os.path.join(MODELS_DIR, 'isolation_forest.pkl')
RF_PATH = os.path.join(MODELS_DIR, 'random_forest.pkl')

# Mock Blacklist
BLACKLIST_BENEFICIARIES = [
    '999900008888', '777722221111', '888844443333', 
    'MULE_ACCOUNT_99', 'SUSPECT_BEN_04', 'FRAUD_MULE_101'
]
BLACKLIST_IFSCS = ['SUSP0000123', 'MULE0000789']

def load_models():
    """Load serialized models, returning None if they don't exist yet."""
    iforest = None
    rf_clf = None
    
    if os.path.exists(IFOREST_PATH):
        try:
            iforest = joblib.load(IFOREST_PATH)
        except Exception as e:
            print(f"Error loading Isolation Forest: {e}")
            
    if os.path.exists(RF_PATH):
        try:
            rf_clf = joblib.load(RF_PATH)
        except Exception as e:
            print(f"Error loading Random Forest Classifier: {e}")
            
    return iforest, rf_clf

def predict_transaction_risk(df_normalized):
    """
    Predict risk levels and reasons for a dataframe of normalized transactions.
    Returns: list of dicts containing {risk_score, risk_level, reasons, is_anomaly}
    """
    if df_normalized.empty:
        return []
        
    # Engineer features
    df_feat = engineer_features(df_normalized)
    
    # Feature columns for ML models
    feature_cols = [
        'log_amount', 'is_debit', 'hour', 'day_of_week',
        'amount_to_avg_ratio', 'time_diff', 'duplicate_flag',
        'odd_hour_flag', 'round_number_flag'
    ]
    
    X = df_feat[feature_cols].values
    
    # Load ML models
    iforest, rf_clf = load_models()
    
    predictions = []
    
    for idx, row in df_feat.iterrows():
        # Get individual features for rules
        amount = float(row['amount'])
        is_debit = int(row['is_debit'])
        hour = int(row['hour'])
        desc = str(row['description']).upper()
        
        # Rule 1: Velocity Check
        velocity_flag = int(row['time_diff'] < 5.0 and is_debit == 1) # Less than 5 minutes gap
        
        # Rule 2: Duplicate Check
        duplicate_flag = int(row['duplicate_flag'])
        
        # Rule 3: Odd Hour Check
        odd_hour_flag = int(row['odd_hour_flag'])
        
        # Rule 4: Round Number Check
        round_number_flag = int(row['round_number_flag'] and amount > 2000)
        
        # Rule 5: Blacklist Check
        blacklist_flag = 0
        if any(b in desc for b in BLACKLIST_BENEFICIARIES) or any(b in desc for b in BLACKLIST_IFSCS):
            blacklist_flag = 1
        if 'MULE' in desc or 'SUSPECT' in desc or 'FRAUD' in desc:
            blacklist_flag = 1
            
        # Calculate Rule-Based Risk Contribution
        # Maximum contribution of rules: 100
        rule_score = 0
        reasons = []
        
        if velocity_flag:
            rule_score += 25
            reasons.append("High velocity: transaction initiated immediately after another debit.")
        if duplicate_flag:
            rule_score += 25
            reasons.append("Duplicate: identical amount and category detected in rapid succession.")
        if odd_hour_flag:
            rule_score += 20
            reasons.append(f"Odd-hour transaction: debit processed at {hour:02d}:00 hours.")
        if round_number_flag:
            rule_score += 15
            reasons.append(f"Round number: large round amount ({amount:.0f}) which is common in quick scams.")
        if blacklist_flag:
            rule_score += 40
            reasons.append("Blacklist match: description matches known high-risk beneficiary / account indicators.")
            
        # Rule 6: Statistical Spike Check
        amount_to_avg = float(row['amount_to_avg_ratio'])
        if amount_to_avg > 3.5 and is_debit == 1:
            rule_score += 30
            reasons.append(f"Amount spike: transaction amount is {amount_to_avg:.1f}x higher than recent averages.")
            
        # Machine Learning Scoring (Hybrid IF + RF)
        ml_score = 0.0
        is_anomaly = 0
        
        x_txn = X[idx].reshape(1, -1)
        
        if iforest is not None and rf_clf is not None:
            # Unsupervised Isolation Forest Anomaly Score
            # decision_function yields values in [-0.5, 0.5]. Lower is more anomalous.
            if_decision = iforest.decision_function(x_txn)[0]
            # Convert decision range to positive [0, 1] indicator (0 = normal, 1 = anomaly)
            if_score = max(0.0, min(1.0, 0.5 - (if_decision * 2.0)))
            
            # Supervised Random Forest Classifier Probability
            rf_prob = rf_clf.predict_proba(x_txn)[0][1]
            
            # Hybrid combination
            ml_score = (0.4 * if_score) + (0.6 * rf_prob)
            
            # Check if flagged as anomaly
            if rf_clf.predict(x_txn)[0] == 1 or iforest.predict(x_txn)[0] == -1:
                is_anomaly = 1
                
        elif rf_clf is not None:
            ml_score = rf_clf.predict_proba(x_txn)[0][1]
            is_anomaly = int(rf_clf.predict(x_txn)[0])
        elif iforest is not None:
            if_decision = iforest.decision_function(x_txn)[0]
            ml_score = max(0.0, min(1.0, 0.5 - (if_decision * 2.0)))
            is_anomaly = 1 if iforest.predict(x_txn)[0] == -1 else 0
        else:
            # Fallback if no models are trained yet
            ml_score = 0.0
            is_anomaly = 0
            
        # Combine Rule-Based Score & ML Score (60% ML, 40% Rules)
        # Scale to 0 - 100
        combined_score = (0.6 * (ml_score * 100)) + (0.4 * min(100.0, rule_score))
        combined_score = max(0.0, min(100.0, combined_score))
        
        # Explain ML anomalies if they contribute significantly
        if ml_score > 0.65:
            reasons.append("ML flagged: transaction features match patterns of known fraud networks.")
            is_anomaly = 1
            
        # Clean duplicate reasons
        unique_reasons = []
        for r in reasons:
            if r not in unique_reasons:
                unique_reasons.append(r)
                
        if not unique_reasons:
            unique_reasons.append("Safe: Transaction aligns with expected activity thresholds.")
            
        # Risk level labeling
        if combined_score < 35.0:
            risk_level = "Low"
        elif combined_score < 70.0:
            risk_level = "Medium"
        else:
            risk_level = "High"
            
        predictions.append({
            'risk_score': round(combined_score, 1),
            'risk_level': risk_level,
            'reasons': unique_reasons,
            'is_anomaly': is_anomaly
        })
        
    return predictions
