// server.js

const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Payhere Credentials
// These should be stored in environment variables for security.
const merchantId = '1231507';
const merchantSecretBase64 = 'ODQ4MjIyNzIyMjM3NzYwMDYzMzQwOTI3NDA4NDYxNDY3MjA3ODAw';

// Decode the merchant secret from Base64 for hash generation/validation
const merchantSecret = Buffer.from(merchantSecretBase64, 'base64').toString('utf-8');

// Initialize Firebase Admin SDK
// Replace with the path to your service account key file
const serviceAccount = require('../tyveklanka-a9dd1-firebase-adminsdk-fbsvc-499855ab0c.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Enable CORS for all routes

// --- Endpoint 1: Generate the Hash for the Checkout Page ---
// This endpoint is called from your checkout.html file
app.post('/payhere_hash', (req, res) => {
    // ✅ This log will appear in your terminal if the endpoint is reached
    console.log("Received a request to generate a hash.");

    const { order_id, amount, currency } = req.body;

    if (!order_id || !amount || !currency) {
        return res.status(400).json({ error: 'Invalid request or missing data' });
    }

    // Hash the decoded merchant secret with MD5 and convert to uppercase
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    console.log("Hashed Secret for signing:", hashedSecret); // Added for debugging
    
    // Format the amount as per Payhere documentation (e.g., "100.00")
    const formattedAmount = Number(amount).toFixed(2);
    
    // Create the hash string
    const hashString = merchantId + order_id + formattedAmount + currency + hashedSecret;

    // Generate the final hash
    const finalHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();
    
    // ✅ This log confirms the hash was generated successfully
    console.log("String to be hashed:", hashString);
    console.log("Final hash generated:", finalHash);

    // Return the hash as a JSON response
    res.json({ hash: finalHash });
});


// --- Endpoint 2: Your Payhere notification handler ---
// This is your publicly accessible notify_url endpoint
app.post('/payhere-notify', async (req, res) => {
    try {
        const {
            merchant_id,
            order_id,
            payment_id,
            payhere_amount,
            payhere_currency,
            status_code,
            md5sig,
            custom_1,
            custom_2,
            method
        } = req.body;

        // --- Hash Validation (Crucial Security Step) ---

        // Hash the decoded merchant secret with MD5 and convert to uppercase
        const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();

        // Recreate the MD5 signature from the received parameters and your hashed secret
        const myMd5sig = crypto.createHash('md5')
            .update(merchant_id + order_id + payhere_amount + payhere_currency + status_code + hashedSecret)
            .digest('hex')
            .toUpperCase();

        // Check if the calculated signature matches the one sent by Payhere
        if (myMd5sig !== md5sig) {
            console.error('Invalid MD5 signature for order:', order_id);
            return res.status(400).send('Invalid Signature');
        }

        // --- Signature is valid, proceed with database update ---
        console.log('Valid payment notification received for order:', order_id);

        // Get a reference to your payments collection
        const paymentsRef = db.collection('Payments');

        // Find the document with the matching orderId
        const querySnapshot = await paymentsRef.where('orderId', '==', order_id).get();

        if (querySnapshot.empty) {
            console.error('Order not found in database:', order_id);
            return res.status(404).send('Order not found');
        }

        // Get the first matching document
        const docRef = querySnapshot.docs[0].ref;

        // Determine the payment status based on status_code
        let paymentStatus = 'Unknown';
        switch (status_code) {
            case '2':
                paymentStatus = 'Success';
                break;
            case '0':
                paymentStatus = 'Pending';
                break;
            case '-1':
                paymentStatus = 'Canceled';
                break;
            case '-2':
                paymentStatus = 'Failed';
                break;
            case '-3':
                paymentStatus = 'Chargedback';
                break;
            default:
                paymentStatus = 'Unknown';
        }

        // Update the payment record in your Firestore database
        await docRef.update({
            paymentStatus: paymentStatus,
            payherePaymentId: payment_id,
            paymentMethod: method,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log('Database updated successfully for order:', order_id);

        // Send a 200 OK status back to Payhere to acknowledge receipt
        res.sendStatus(200);

    } catch (error) {
        console.error('Error processing Payhere notification:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});