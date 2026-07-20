import os
import json
import pandas as pd
from app.train_model import train_and_evaluate, retrain_with_feedback, METRICS_FILE
from app.predict import predict_transaction_risk

def test_pipeline():
    print("=================================================")
    print("Starting ML Pipeline Integration Tests...")
    print("=================================================")

    # 1. Trigger initial model training if metrics are missing
    if not os.path.exists(METRICS_FILE):
        print("Models not found. Running initial training bootstrap...")
        metrics = train_and_evaluate()
        assert metrics is not None
        assert 'accuracy' in metrics
        print("Model training bootstrap completed successfully.")
    else:
        print("Existing model metrics found. Using current weights.")

    # 2. Test Anomaly and Normal Predictions
    print("\nTesting inference engine on sample profiles...")
    mock_data = pd.DataFrame([
        {
            'date': '2026-07-20 12:00:00',
            'description': 'SAFE GROCERY OUTLET PURCHASE',
            'amount': 45.50,
            'debit_amount': 45.50,
            'credit_amount': 0.0,
            'type': 'debit',
            'balance': 9800.00,
            'category': 'Dining & Entertainment'
        },
        {
            'date': '2026-07-20 03:30:00',
            'description': 'UPI WIRE TO MULE_ACCOUNT_99',
            'amount': 90000.00,
            'debit_amount': 90000.00,
            'credit_amount': 0.0,
            'type': 'debit',
            'balance': 150000.00,
            'category': 'Transfer'
        }
    ])

    # We can inspect feature extraction directly
    from app.preprocess import engineer_features
    df_feat = engineer_features(mock_data)
    print("\n--- ENGINEERED FEATURES DATAFRAME ---")
    print(df_feat[['date', 'description', 'amount', 'odd_hour_flag', 'round_number_flag']])
    
    results = predict_transaction_risk(mock_data)
    assert len(results) == 2

    normal_txn = results[0]
    anomaly_txn = results[1]

    print("\n--- PREDICTION RESULTS ---")
    print(f"- Index 0: Score={normal_txn['risk_score']}%, Level={normal_txn['risk_level']}, Reasons={normal_txn['reasons']}")
    print(f"- Index 1: Score={anomaly_txn['risk_score']}%, Level={anomaly_txn['risk_level']}, Reasons={anomaly_txn['reasons']}")

    assert normal_txn['risk_level'] == 'Low'
    assert anomaly_txn['risk_level'] in ['Medium', 'High']
    print("Inference thresholds checked successfully.")

    # 3. Test Retraining with user feedback
    print("\nTesting user feedback and model retraining pipeline...")
    # Inject a feedback entry
    feedback_entry = pd.DataFrame([{
        'date': '2026-07-20 23:00:00',
        'description': 'MOCK FRAUD TRANSACTION TO BLACKLIST',
        'amount': 15000.00,
        'debit_amount': 15000.00,
        'credit_amount': 0.0,
        'type': 'debit',
        'balance': 12000.00,
        'category': 'Transfer',
        'is_fraud_label': 1
    }])
    
    feedback_path = os.path.join(os.path.dirname(__file__), 'models/labeled_feedback.csv')
    feedback_entry.to_csv(feedback_path, index=False)
    
    new_metrics = retrain_with_feedback()
    assert new_metrics is not None
    assert new_metrics['total_samples'] > 1000
    print("Model successfully retrained. New metrics stored.")

    # Cleanup test feedback file to keep workspace clean
    if os.path.exists(feedback_path):
        os.remove(feedback_path)

    print("\n=================================================")
    print("ML Pipeline Integration Tests Passed Successfully!")
    print("=================================================")

if __name__ == '__main__':
    test_pipeline()
