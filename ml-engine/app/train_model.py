import os
import sys
sys.path.append(os.path.dirname(__file__))

import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from preprocess import engineer_features

# Paths
MODELS_DIR = os.path.join(os.path.dirname(__file__), '../models')
METRICS_FILE = os.path.join(MODELS_DIR, 'metrics.json')
FEEDBACK_FILE = os.path.join(MODELS_DIR, 'labeled_feedback.csv')

# Ensure models directory exists
os.makedirs(MODELS_DIR, exist_ok=True)

def generate_synthetic_data(num_samples=1000):
    """
    Generate synthetic transactions with regular profiles and injected fraud flags.
    Label: 0 = Normal, 1 = Fraud Anomaly
    """
    np.random.seed(42)
    
    categories = ['Salary', 'Cash', 'UPI', 'Transfer', 'Utility', 'Dining & Entertainment', 'Investment', 'Miscellaneous']
    
    data = []
    base_time = pd.Timestamp('2026-01-01 09:00:00')
    
    # Track accounts for stateful features
    account_balances = {101: 50000.0, 102: 12000.0}
    
    for i in range(num_samples):
        # Determine if this sample is a normal or anomaly transaction (approx 5% anomalies)
        is_fraud = np.random.choice([0, 1], p=[0.95, 0.05])
        
        acc_id = np.random.choice([101, 102])
        balance = account_balances[acc_id]
        
        # 1. Normal Transactions
        if is_fraud == 0:
            category = np.random.choice(categories, p=[0.05, 0.15, 0.35, 0.20, 0.10, 0.10, 0.02, 0.03])
            
            # Setup normal amounts based on category
            if category == 'Salary':
                amount = np.random.uniform(25000, 35000)
                txn_type = 'credit'
            elif category == 'Utility':
                amount = np.random.uniform(500, 2000)
                txn_type = 'debit'
            elif category == 'Dining & Entertainment':
                amount = np.random.uniform(150, 1200)
                txn_type = 'debit'
            elif category == 'Cash':
                amount = np.random.choice([500, 1000, 2000, 5000])
                txn_type = 'debit' if np.random.rand() > 0.3 else 'credit'
            elif category == 'UPI':
                amount = np.random.uniform(10, 500)
                txn_type = 'debit'
            elif category == 'Transfer':
                amount = np.random.uniform(1000, 8000)
                txn_type = 'debit' if np.random.rand() > 0.2 else 'credit'
            elif category == 'Investment':
                amount = np.random.uniform(2000, 10000)
                txn_type = 'debit'
            else:
                amount = np.random.uniform(100, 1500)
                txn_type = 'debit'
                
            # Normal transactions occur during daytime/evening (6 AM - midnight)
            hour = np.random.randint(6, 24)
            description = f"Normal {category} transaction"
            
        # 2. Fraud Anomaly Transactions
        else:
            fraud_pattern = np.random.choice(['amount_spike', 'odd_hour_large', 'velocity_duplicate', 'blacklist_transfer'])
            
            if fraud_pattern == 'amount_spike':
                # Unusual large debit
                amount = np.random.uniform(40000, 85000)
                category = 'Transfer'
                txn_type = 'debit'
                hour = np.random.randint(9, 18)
                description = "Suspicious large bank transfer"
                
            elif fraud_pattern == 'odd_hour_large':
                # Large debit at 3 AM
                amount = np.random.uniform(8000, 25000)
                category = 'Cash'
                txn_type = 'debit'
                hour = np.random.randint(1, 5)
                description = "ATM cash withdrawal odd-hour"
                
            elif fraud_pattern == 'velocity_duplicate':
                # Duplicate UPI spend in rapid succession
                amount = 2500.0 # Repeated exact round amount
                category = 'UPI'
                txn_type = 'debit'
                hour = np.random.randint(10, 20)
                description = "UPI transfer to merchant"
                
            elif fraud_pattern == 'blacklist_transfer':
                # Large round transfer
                amount = 15000.0
                category = 'Transfer'
                txn_type = 'debit'
                hour = np.random.randint(8, 22)
                description = "UPI transfer to suspect account"
                
        # Update balance
        if txn_type == 'credit':
            balance += amount
        else:
            balance -= amount
            
        account_balances[acc_id] = balance
        
        # Calculate date timestamp
        # Distribute transactions over time (roughly one every few hours)
        time_offset = pd.Timedelta(hours=i * 2 + np.random.randint(-30, 30))
        txn_time = base_time + time_offset
        # Force hour to the chosen category hour
        txn_time = txn_time.replace(hour=hour, minute=np.random.randint(0, 59))
        
        data.append({
            'date': txn_time.strftime('%Y-%m-%d %H:%M:%S'),
            'description': description,
            'amount': amount,
            'debit_amount': amount if txn_type == 'debit' else 0.0,
            'credit_amount': amount if txn_type == 'credit' else 0.0,
            'type': txn_type,
            'balance': balance,
            'category': category,
            'is_fraud_label': is_fraud
        })
        
    df = pd.DataFrame(data)
    return df

def train_and_evaluate(df_raw=None):
    """
    Train Isolation Forest & Random Forest. Evaluate on test set.
    """
    if df_raw is None:
        # Load synthetic data
        df_raw = generate_synthetic_data()
        
    # Preprocess and engineer features
    df_feat = engineer_features(df_raw)
    
    # Save the labels
    y = df_feat['is_fraud_label'].values
    
    # Feature columns for ML models
    feature_cols = [
        'log_amount', 'is_debit', 'hour', 'day_of_week',
        'amount_to_avg_ratio', 'time_diff', 'duplicate_flag',
        'odd_hour_flag', 'round_number_flag'
    ]
    
    X = df_feat[feature_cols].values
    
    # Split into train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # 1. Train Unsupervised Isolation Forest
    # We fit it on all train data, letting it detect anomalies natively
    contamination = max(0.01, min(0.1, np.mean(y_train))) # Dynamically guess contamination rate
    iforest = IsolationForest(contamination=contamination, random_state=42)
    iforest.fit(X_train)
    
    # 2. Train Supervised Random Forest Classifier
    rf_clf = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
    rf_clf.fit(X_train, y_train)
    
    # Evaluate Random Forest (Supervised Model)
    y_pred = rf_clf.predict(X_test)
    
    metrics = {
        'accuracy': float(accuracy_score(y_test, y_pred)),
        'precision': float(precision_score(y_test, y_pred, zero_division=0)),
        'recall': float(recall_score(y_test, y_pred, zero_division=0)),
        'f1_score': float(f1_score(y_test, y_pred, zero_division=0)),
        'last_trained_date': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_samples': len(df_feat),
        'fraud_ratio': float(np.mean(y))
    }
    
    # Save models and metrics
    joblib.dump(iforest, os.path.join(MODELS_DIR, 'isolation_forest.pkl'))
    joblib.dump(rf_clf, os.path.join(MODELS_DIR, 'random_forest.pkl'))
    
    with open(METRICS_FILE, 'w') as f:
        json.dump(metrics, f, indent=2)
        
    print(f"Models successfully trained. Metrics: {json.dumps(metrics, indent=2)}")
    return metrics

def retrain_with_feedback():
    """
    Load base training data, append any user feedback details, and retrain models.
    """
    df_base = generate_synthetic_data(1000)
    
    # Look for manual feedback csv
    if os.path.exists(FEEDBACK_FILE):
        try:
            df_feedback = pd.read_csv(FEEDBACK_FILE)
            # Ensure feedback df has correct columns
            required_cols = ['date', 'description', 'amount', 'debit_amount', 'credit_amount', 'type', 'balance', 'category', 'is_fraud_label']
            df_feedback = df_feedback[required_cols]
            # Concatenate to base
            df_merged = pd.concat([df_base, df_feedback], ignore_index=True)
            print(f"Loaded {len(df_feedback)} feedback rows. Merged dataset size: {len(df_merged)}")
            return train_and_evaluate(df_merged)
        except Exception as e:
            print(f"Failed to read feedback file: {e}. Retraining with base data only.")
            
    return train_and_evaluate(df_base)

if __name__ == '__main__':
    train_and_evaluate()
