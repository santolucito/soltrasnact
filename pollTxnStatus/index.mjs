import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

function getImageUrl(transactionId, side) {
    const folder = side === 'front' ? 'postcard-fronts' : 'postcard-backs';
    return `https://${process.env.S3_BUCKET_NAME}.s3.us-east-2.amazonaws.com/${folder}/${transactionId}.png`;
}

export const handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Headers": "Content-Type,Accept",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Cache-Control": "no-cache"
    };

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: null,
        };
    }

    try {
        const { transactionId } = JSON.parse(event.body);

        if (!transactionId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: "transactionId is required" }),
            };
        }

        const params = {
            TableName: "Transactions",
            Key: { transactionId },
        };

        const result = await ddbDocClient.send(new GetCommand(params));

        if (!result.Item) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: "Transaction not found" }),
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: result.Item.status,
                transactionId: result.Item.transactionId
            }),
        };

    } catch (error) {
        console.error("Error fetching transaction:", error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: "Failed to fetch transaction status" }),
        };
    }
};
