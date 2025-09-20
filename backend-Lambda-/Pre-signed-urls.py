#set trigger as API Gateway

import json
import boto3
import os
import uuid

BUCKET = "nilve-expense-tracker-receipts"

def lambda_handler(event, context):
    # Optionally fetch the file extension (default to .bin)
    body = json.loads(event.get("body", "{}"))
    ext = body.get("ext", "bin").replace(".", "").lower()  # e.g., 'jpg', 'png', 'pdf'
    unique_id = str(uuid.uuid4())
    key = f"uploads/{unique_id}.{ext}"

    s3 = boto3.client("s3")

    # Set up POST fields/policy
    presigned = s3.generate_presigned_post(
        Bucket=BUCKET,
        Key=key,
        Fields=None,
        Conditions=[
            ["starts-with", "$key", "uploads/"],
            ["content-length-range", 0, 10485760]  # Max 10MB
        ],
        ExpiresIn=300  # URL valid for 5min
    )

    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",  # for browser CORS allow permissions
            "Content-Type": "application/json",
        },
        "body": json.dumps({
            "url": presigned["url"],
            "fields": presigned["fields"]
        }),
    }
