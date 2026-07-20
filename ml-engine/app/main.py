import os
import sys
sys.path.append(os.path.dirname(__file__))

import json
import io
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pypdf

# Local modules
from preprocess import (
    get_headers_hash,
    load_saved_mappings,
    save_mapping,
    fuzzy_detect_columns,
    normalize_dataframe,
    TARGET_FIELDS
)
from predict import predict_transaction_risk
from train_model import retrain_with_feedback, METRICS_FILE, FEEDBACK_FILE

app = FastAPI(title="FraudShield ML Detection Engine", version="1.0.0")

# Enable CORS for communication with Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TransactionInput(BaseModel):
    date: str
    description: str
    amount: float
    type: str # debit/credit
    balance: float
    category: Optional[str] = "Miscellaneous"

class RetrainFeedbackInput(BaseModel):
    date: str
    description: str
    amount: float
    debit_amount: float
    credit_amount: float
    type: str
    balance: float
    category: str
    is_fraud_label: int # 1 = Fraud, 0 = Normal

def parse_pdf_to_df(file_bytes):
    """
    Parse a standard bank statement PDF and extract transactions into a DataFrame.
    Looks for line matches containing date patterns and debit/credit columns.
    """
    pdf_file = io.BytesIO(file_bytes)
    reader = pypdf.PdfReader(pdf_file)
    
    rows = []
    # General date regex: DD/MM/YYYY, DD-MM-YYYY, DD-MMM-YYYY, YYYY-MM-DD
    date_regex = re.compile(r'(\b\d{2}[-/.]\d{2}[-/.]\d{2,4}\b|\b\d{2}[-/.]\w{3}[-/.]\d{2,4}\b|\b\d{4}[-/.]\d{2}[-/.]\d{2}\b)')
    
    for page_idx, page in enumerate(reader.pages):
        text = page.extract_text()
        if not text:
            continue
            
        lines = text.split('\n')
        for line in lines:
            line_str = line.strip()
            date_match = date_regex.search(line_str)
            if not date_match:
                continue
                
            # Found a date. Let's isolate the date, description, and amounts.
            txn_date = date_match.group(1)
            
            # Remove the date from the line to find transaction details
            rem = line_str.replace(txn_date, '', 1).strip()
            
            # Find numbers at the end of the string (usually: Debit, Credit, Balance)
            # Find all numbers with decimals or commas
            numbers = re.findall(r'([-+]?\d{1,3}(?:,\d{3})*\.\d{2}|[-+]?\d+\.\d{2})', rem)
            
            if len(numbers) >= 1:
                # The last number is typically the Balance
                balance_val = numbers[-1]
                
                # Reconstruct description and other figures
                desc = rem
                for num in numbers:
                    desc = desc.replace(num, '', 1)
                desc = re.sub(r'\s+', ' ', desc).strip()
                
                # Check for debits/credits
                debit_val = 0.0
                credit_val = 0.0
                
                if len(numbers) >= 3:
                    debit_val = numbers[0]
                    credit_val = numbers[1]
                elif len(numbers) == 2:
                    # In many statements, a line has either debit or credit, plus balance.
                    # We can check keywords or assume based on values
                    val = float(numbers[0].replace(',', ''))
                    # If withdrawal is in description or negative number, it's a debit
                    if 'WITHDRAW' in desc.upper() or 'DR' in desc.upper() or 'DEBIT' in desc.upper():
                        debit_val = numbers[0]
                    elif 'DEPOSIT' in desc.upper() or 'CR' in desc.upper() or 'CREDIT' in desc.upper():
                        credit_val = numbers[0]
                    else:
                        # Fallback: assume debit for smaller values, credit for large, or use first column
                        debit_val = numbers[0]
                else:
                    # Only balance was found. Hard to guess txn amount, skip or treat as 0.0
                    continue
                    
                rows.append({
                    'Raw Date': txn_date,
                    'Description': desc if desc else "Transaction",
                    'Debit': debit_val,
                    'Credit': credit_val,
                    'Balance': balance_val
                })
                
    if not rows:
        raise ValueError("Could not extract any transactions from the PDF statement. Ensure it is text-based.")
        
    return pd.DataFrame(rows)

import re

@app.post("/parse")
async def parse_statement(
    file: UploadFile = File(...),
    bank_name: Optional[str] = Form("Standard Bank"),
    mapping_json: Optional[str] = Form(None)
):
    """
    Parse statement files (CSV, XLSX, PDF) and check headers.
    If headers are unrecognized, request mapping from client.
    """
    contents = await file.read()
    filename = file.filename.lower()
    
    # 1. Load file into a raw pandas DataFrame
    try:
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(contents))
        elif filename.endswith('.pdf'):
            df = parse_pdf_to_df(contents)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV, Excel, or PDF.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
        
    if df.empty:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
        
    # Get raw headers
    headers = [str(col).strip() for col in df.columns]
    headers_hash = get_headers_hash(headers)
    
    # 2. Check if mapping configuration is provided in the request
    mapping = None
    if mapping_json:
        try:
            mapping = json.loads(mapping_json)
            # Save mapping template for future automatic use
            save_mapping(headers_hash, bank_name, mapping)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid mapping JSON parameter: {str(e)}")
            
    # 3. If no mapping provided, check template cache
    if not mapping:
        saved_templates = load_saved_mappings()
        if headers_hash in saved_templates:
            mapping = saved_templates[headers_hash]['mapping']
            bank_name = saved_templates[headers_hash]['bank_name']
            
    # 4. If still no mapping, execute fuzzy detection
    if not mapping:
        mapping_detected, confidence, requires_override = fuzzy_detect_columns(headers)
        
        if requires_override:
            # We must show mapping configuration screen in the frontend
            # Convert first 5 rows to list of dicts for header mapping preview
            preview_rows = df.head(5).fillna("").to_dict(orient='records')
            return {
                'requires_mapping': True,
                'headers_hash': headers_hash,
                'detected_headers': headers,
                'suggested_mapping': mapping_detected,
                'preview_rows': preview_rows
            }
        else:
            mapping = mapping_detected
            
    # 5. Normalize DataFrame
    try:
        df_normalized = normalize_dataframe(df, mapping)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to normalize bank statement: {str(e)}")
        
    if df_normalized.empty:
        raise HTTPException(status_code=400, detail="No valid transactions parsed from the statement columns.")
        
    # 6. Predict Risks
    try:
        predictions = predict_transaction_risk(df_normalized)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate transaction risk scores: {str(e)}")
        
    # Combine normalized transactions with risk scores
    results = []
    for idx, row in df_normalized.iterrows():
        txn = row.to_dict()
        txn['risk_score'] = predictions[idx]['risk_score']
        txn['risk_level'] = predictions[idx]['risk_level']
        txn['reasons'] = predictions[idx]['reasons']
        txn['is_anomaly'] = predictions[idx]['is_anomaly']
        results.append(txn)
        
    return {
        'requires_mapping': False,
        'bank_name': bank_name,
        'headers_hash': headers_hash,
        'transactions': results
    }

@app.post("/predict")
async def predict_realtime_risk(transactions: List[TransactionInput]):
    """
    Score incoming real-time transactions (e.g., money transfers).
    """
    if not transactions:
        raise HTTPException(status_code=400, detail="Transaction list cannot be empty.")
        
    # Convert inputs to DataFrame
    rows = []
    for txn in transactions:
        rows.append({
            'date': txn.date,
            'description': txn.description,
            'amount': txn.amount,
            'debit_amount': txn.amount if txn.type == 'debit' else 0.0,
            'credit_amount': txn.amount if txn.type == 'credit' else 0.0,
            'type': txn.type,
            'balance': txn.balance,
            'category': txn.category
        })
        
    df = pd.DataFrame(rows)
    
    try:
        predictions = predict_transaction_risk(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model scoring failed: {str(e)}")
        
    return predictions

@app.post("/retrain")
async def retrain_model_endpoint(feedback: List[RetrainFeedbackInput]):
    """
    Add user-verified transaction classifications to model datasets and retrain.
    """
    if not feedback:
        raise HTTPException(status_code=400, detail="Feedback rows cannot be empty.")
        
    rows = []
    for f in feedback:
        rows.append({
            'date': f.date,
            'description': f.description,
            'amount': f.amount,
            'debit_amount': f.debit_amount,
            'credit_amount': f.credit_amount,
            'type': f.type,
            'balance': f.balance,
            'category': f.category,
            'is_fraud_label': f.is_fraud_label
        })
        
    df_feedback = pd.DataFrame(rows)
    
    # Save feedback items incrementally to CSV
    try:
        if os.path.exists(FEEDBACK_FILE):
            df_feedback.to_csv(FEEDBACK_FILE, mode='a', header=False, index=False)
        else:
            df_feedback.to_csv(FEEDBACK_FILE, index=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record feedback entries: {str(e)}")
        
    # Retrain
    try:
        new_metrics = retrain_with_feedback()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrain ML models: {str(e)}")
        
    return {
        'message': "Models retrained successfully with user feedback.",
        'metrics': new_metrics
    }

@app.get("/metrics")
async def get_model_metrics():
    """
    Retrieve current model performance metrics.
    """
    if not os.path.exists(METRICS_FILE):
        # Trigger an initial training to ensure models exist out of the box
        try:
            from train_model import train_and_evaluate
            metrics = train_and_evaluate()
            return metrics
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not initialize ML models: {str(e)}")
            
    try:
        with open(METRICS_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read model metrics: {str(e)}")
