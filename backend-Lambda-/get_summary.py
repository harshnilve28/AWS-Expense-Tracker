#trigger as API Gateway /summary

import json
import boto3
from decimal import Decimal

TABLE = "table-name"
REGION = "us-east-1" #your region here 

def decimal_default(obj):
    """JSON serializer for DynamoDB Decimal objects"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def lambda_handler(event, context):
    # Initialize DynamoDB
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(TABLE)
    
    try:
        # Scan the entire table to get all expense items
        response = table.scan()
        items = response.get('Items', [])
        
        # Initialize category totals
        summary = {
            "Food": 0,
            "Clothes": 0, 
            "Travel": 0,
            "Medical": 0
        }
        
        # Sum amounts by category
        for item in items:
            category = item.get('category', 'Other')
            amount = item.get('amount', 0)
            
            # Convert Decimal to float if needed
            if isinstance(amount, Decimal):
                amount = float(amount)
            
            # Add to summary if it's one of our tracked categories
            if category in summary:
                summary[category] += amount
        
        print(f"Summary calculated: {summary}")
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Content-Type": "application/json"
            },
            "body": json.dumps(summary, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"error": str(e)})
        }
