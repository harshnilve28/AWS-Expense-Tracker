#Should be triggered by S3 bucket obj upload
#Also set required IAM permission like for S3- view, DynamoDB- write, Textract -read, etc

import boto3
import json
import os
import uuid
from datetime import datetime
from decimal import Decimal

BUCKET = "Your-bucket-name"
TABLE = "DynomoDB-table-name"
REGION = "us-east-1"

s3 = boto3.client('s3')
textract = boto3.client('textract', region_name=REGION)
dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE)

def extract_amount_and_category(text):
    """Very simple parsing: looks for numbers and keyword matches."""
    text_lower = text.lower()
    categories = {
        "food": ["food", "restaurant", "cafe", "lunch", "dinner", "pizza", "snack"],
        "clothes": ["apparel", "cloth", "shirt", "jeans", "dress", "zara", "fashion", "boutique"],
        "travel": ["flight", "train", "uber", "taxi", "travel", "hotel", "bus", "metro", "autoriksha", "petrol"],
        "medical": ["hospital", "doctor", "pharmacy", "clinic", "tablet", "medicine", "medical", "chemist"]
    }
    # Choose the category that matches most with keywords
    chosen_cat = "Other"
    most_matches = 0
    for cat, keywords in categories.items():
        matches = sum(kw in text_lower for kw in keywords)
        if matches > most_matches:
            chosen_cat = cat.capitalize()
            most_matches = matches
    
    # Find the largest number in the text, format-independent (could be price)
    import re
    amounts = [float(m.replace(',', '')) for m in re.findall(r'(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+|\d+)', text)]
    amount = max(amounts) if amounts else 0
    return amount, chosen_cat

def lambda_handler(event, context):
    # 1. Parse S3 trigger event
    record = event['Records'][0]
    bucket = record['s3']['bucket']['name']
    key = record['s3']['object']['key']

    # 2. Only process .jpg, .jpeg, .png, .pdf, .bin
    allowed = ('.jpg', '.jpeg', '.png', '.pdf', '.bin')
    if not key.lower().endswith(allowed):
        print("Skipping non-receipt file:", key)
        return {"statusCode": 200}

    # 3. Call Textract (Document Text Detection) - Robust version
    print(f"Processing {key} from {bucket}")
    if key.lower().endswith('.pdf'):
        print("PDFs need async processing; skipping for demo.")
        return {"statusCode": 200}
    else:
        try:
            response = textract.detect_document_text(
                Document={'S3Object': {'Bucket': bucket, 'Name': key}}
            )
            
            # Safely extract text from all available blocks
            lines = []
            for block in response.get('Blocks', []):
                # Try different text fields that Textract might use
                text_content = block.get('Text') or block.get('DetectedText', '')
                if block.get('BlockType') == 'LINE' and text_content:
                    lines.append(text_content)
            
            text = "\n".join(lines)
            
            if not text.strip():
                print("Warning: No text extracted from image")
                text = "No text detected"
                
            print(f"Extracted text: {text[:200]}...")  # Log first 200 chars
            
        except Exception as e:
            print(f"Error processing image with Textract: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    # 4. Extract amount and category
    amount, category = extract_amount_and_category(text)
    print(f"Extracted amount: {amount}, category: {category}")

    # 5. Write to DynamoDB - FIXED VERSION with Decimal conversion
    try:
        item = {
            "id": str(uuid.uuid4()),
            "category": category,
            "amount": Decimal(str(amount)),  # Convert float to Decimal for DynamoDB
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "raw_text": text,
            "s3_key": key
        }
        table.put_item(Item=item)
        print(f"Item written to DynamoDB: {item}")
        
    except Exception as e:
        print(f"Error writing to DynamoDB: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Processed", "item": item}, default=str)  # default=str handles Decimal serialization
    }
