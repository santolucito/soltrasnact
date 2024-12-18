import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = new SNSClient({});

async function doTheThing(transaction) {
    console.log("doing the thing that the user paid for", transaction);
}

export const handler = async (event) => {
    let priceWithVerificationFee;
    let transaction;
    let solscanLink;

    const heliusMessage = JSON.parse(event.body);
    console.log("heliusMessage", JSON.stringify(heliusMessage, null, 2));

    const transfer = heliusMessage[0];
    priceWithVerificationFee = transfer.nativeTransfers[0].amount;
    solscanLink = `https://solscan.io/tx/${transfer.signature}`;

    const queryParams = {
        TableName: "Transactions",
        IndexName: "priceWithVerificationFee-index",
        KeyConditionExpression: "priceWithVerificationFee = :priceWithVerificationFee",
        FilterExpression: "#status = :pendingStatus",
        ExpressionAttributeNames: {
            "#status": "status"
        },
        ExpressionAttributeValues: {
            ":priceWithVerificationFee": priceWithVerificationFee,
            ":pendingStatus": "pending"
        }
    };

    const queryResult = await ddbDocClient.send(new QueryCommand(queryParams));

    if (!queryResult.Items || queryResult.Items.length === 0) {
        console.log("no matching transaction found");
        return {
            statusCode: 404,
            body: JSON.stringify({ message: "No matching transaction found" }),
        };
    }

    transaction = queryResult.Items[0];

    console.log("priceWithVerificationFee", priceWithVerificationFee);


    const updateParams = {
        TableName: "Transactions",
        Key: { transactionId: transaction.transactionId },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
            ":status": "complete",
            ":updatedAt": new Date().toISOString(),
        },
    };

    await ddbDocClient.send(new UpdateCommand(updateParams));

    try {
        await doTheThing(transaction, solscanLink);
        console.log("did the thing successfully");
    } catch (error) {
        console.error("Error doing the thing:", error);
    }

    await snsClient.send(new PublishCommand({
        TopicArn: "XXXXXXXXXX",
        Message: JSON.stringify({
            message: "Transaction completed successfully"
        })
    }));

    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Transaction updated to complete" }),
    };
};