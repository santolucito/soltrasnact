import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from 'crypto';

//A users requests to make a payment, and this lambda creates the transaction in the database
//The client side pases in a productId and we look up the price of the product
// calculate the price + the verification fee, and that is the amount of SOL the user needs to send
// the amount is logged in the database and also sent back to the client side
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

//given a productId, return the price of the product in lamports
function lookupProductPrice(productId) {
    const prices = {
        "1": 0.01 * 10 ** 9, // T-Shirt: 0.01 SOL
        "2": 0.02 * 10 ** 9, // Hoodie: 0.02 SOL
        "3": 0.005 * 10 ** 9 // Mug: 0.005 SOL
    };

    if (prices[productId]) {
        return prices[productId];
    }
    throw new Error("Invalid productId");
}

export const handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Headers": "Content-Type,Accept",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Cache-Control": "no-cache"
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: null,
        };
    }

    const { productId, shippingAddress, email, imageUrl, imagePrompt, message, isMessagePrompt } = JSON.parse(event.body);

    // Validate shipping address
    if (!shippingAddress || !shippingAddress.name || !shippingAddress.street ||
        !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "Invalid shipping address" }),
        };
    }

    console.log("productId", productId);
    const price = lookupProductPrice(productId);

    // Extract last 5 digits from timestamp and convert to lamports
    // the max fee is 0.00099999 SOL - about 0.02 USD
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const verificationFee = parseFloat(random.slice(-5));

    const priceWithVerificationFee = price + verificationFee;

    const transactionId = `txn-${timestamp}-${random}`;

    const params = {
        TableName: "Transactions",
        Item: {
            transactionId,
            price: price,
            verificationFee: verificationFee,
            priceWithVerificationFee: priceWithVerificationFee,
            status: "pending",
            createdAt: new Date().toISOString(),
            shippingAddress: {
                name: shippingAddress.name,
                street: shippingAddress.street,
                city: shippingAddress.city,
                state: shippingAddress.state,
                zipCode: shippingAddress.zipCode,
                country: shippingAddress.country || 'US'
            },
            email: email || null,
            imageUrl: imageUrl || null,
            imagePrompt: imagePrompt || null,
            message: message || null,
            isMessagePrompt: isMessagePrompt || false
        },
    };

    try {
        await ddbDocClient.send(new PutCommand(params));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ transactionId, price, verificationFee, priceWithVerificationFee }),
        };
    } catch (error) {
        console.error("Error writing to DynamoDB:", error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: "Failed to log transaction" }),
        };
    }
};
