/**
 * @fileoverview Firebase Cloud Function to securely generate a Payhere payment hash.
 * This function is deployed to your Firebase project and safely generates the hash for client-side use.
 * This version uses the Firebase Functions v2 syntax for proper deployment.
 */

const { onCall } = require('firebase-functions/v2/https');
const { HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const logger = require('firebase-functions/logger');

// The Payhere Merchant Secret is a highly sensitive credential.
// It must be stored securely as a Firebase Secret.
// To set this variable, run the following command in your terminal:
// firebase functions:secrets:set PAYHERE_MERCHANT_SECRET="<YOUR_PAYHERE_MERCHANT_SECRET>"
// (Replace with your actual secret)

/**
 * HTTP callable function to generate a Payhere hash.
 * This function receives payment data, calculates a secure hash, and returns it to the client.
 * It's structured for Firebase Functions v2.
 */
exports.generatePayhereHash = onCall(async (request) => {
    // Check if the request is authenticated
    if (!request.auth) {
        logger.error("Unauthorized request to generatePayhereHash");
        throw new HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
    }

    try {
        const data = request.data;
        // Ensure the payment data is provided
        if (!data || !data.payment) {
            throw new HttpsError('invalid-argument', 'Payment data is missing.');
        }

        // Your Payhere Merchant ID
        const merchantId = data.payment.merchantId;
        const { orderId, amount, currency } = data.payment;
        
        // Access the secret from the environment variables (best practice for v2)
        const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

        // Verify all required data is present
        if (!merchantId || !orderId || !amount || !currency || !merchantSecret) {
            throw new Error("Missing required data for hash calculation.");
        }

        // IMPORTANT: Format the amount to two decimal places as per PayHere documentation.
        const formattedAmount = parseFloat(amount).toFixed(2);

        // Step 1: MD5 hash the merchant secret
        const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();

        // Step 2: Create the hash string in the correct format as per documentation
        const hashString = merchantId + orderId + formattedAmount + currency + hashedSecret;

        // Step 3: Generate the final MD5 hash for Payhere
        const hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

        logger.info("Generated hash:", { hash: hash });

        return { hash };
    } catch (error) {
        logger.error("Error generating Payhere hash:", error);
        // Return a user-friendly error message
        throw new HttpsError('internal', 'Failed to generate payment hash.', error.message);
    }
});