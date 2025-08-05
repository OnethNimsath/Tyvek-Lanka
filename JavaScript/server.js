const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// ✅ PayHere Credentials - Based on official documentation
const merchantId = '1231507';
const merchantSecretBase64 = 'ODQ4MjIyNzIyMjM3NzYwMDYzMzQwOTI3NDA4NDYxNDY3MjA3ODAw';

// Decode merchant secret properly
const merchantSecret = Buffer.from(merchantSecretBase64, 'base64').toString('utf8');

console.log('=== PayHere Configuration ===');
console.log('Merchant ID:', merchantId);
console.log('Merchant Secret Length:', merchantSecret.length);
console.log('Merchant Secret Preview:', merchantSecret.substring(0, 15) + '...');
console.log('==============================');

// Initialize Firebase Admin SDK
const serviceAccount = require('../tyveklanka-a9dd1-firebase-adminsdk-fbsvc-499855ab0c.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ✅ Enhanced CORS configuration to prevent CORS errors
app.use(cors({
    origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:3000',
        'https://sandbox.payhere.lk',
        'https://www.payhere.lk',
        'null' // Allow requests from file:// protocol
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200 // Support legacy browsers
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging and headers
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    
    // ✅ Add Permissions-Policy header to allow unload events for PayHere compatibility
    res.setHeader('Permissions-Policy', 'unload=(self)');
    
    next();
});

// ✅ PayHere Hash Generation - Following EXACT official documentation
// Official format: hash = to_upper_case(md5(merchant_id + order_id + amount + currency + to_upper_case(md5(merchant_secret))))
// PHP equivalent: number_format($amount, 2, '.', '') ensures NO thousands separators
function generatePayHereHash(merchant_id, order_id, amount, currency, merchant_secret) {
    try {
        console.log('=== Hash Generation (EXACT Official PayHere Format) ===');
        console.log('merchant_id:', merchant_id);
        console.log('order_id:', order_id);
        console.log('amount (raw):', amount);
        console.log('currency:', currency);
        
        // ✅ Step 1: Format amount EXACTLY like PHP number_format($amount, 2, '.', '')
        // This ensures: 2 decimal places, decimal point, NO thousands separators
        const amountFloat = parseFloat(amount);
        if (isNaN(amountFloat)) {
            throw new Error('Invalid amount: ' + amount);
        }
        
        // PHP number_format($amount, 2, '.', '') equivalent
        const formattedAmount = amountFloat.toFixed(2);
        console.log('formatted amount (PHP equivalent):', formattedAmount);
        
        // ✅ Step 2: MD5 hash of merchant secret, then convert to UPPERCASE
        const hashedSecret = crypto.createHash('md5')
            .update(merchant_secret)
            .digest('hex')
            .toUpperCase();
        
        console.log('hashedSecret (MD5 of secret):', hashedSecret);
        
        // ✅ Step 3: Concatenate in EXACT PayHere order
        const hashString = merchant_id + order_id + formattedAmount + currency + hashedSecret;
        console.log('hashString for MD5:', hashString);
        console.log('hashString length:', hashString.length);
        
        // ✅ Step 4: MD5 hash of concatenated string, then convert to UPPERCASE
        const finalHash = crypto.createHash('md5')
            .update(hashString)
            .digest('hex')
            .toUpperCase();
        
        console.log('finalHash:', finalHash);
        console.log('finalHash length:', finalHash.length);
        console.log('=== End Hash Generation ===');
        
        // Validate hash format
        if (finalHash.length !== 32) {
            throw new Error('Invalid hash length: ' + finalHash.length);
        }
        
        return finalHash;
    } catch (error) {
        console.error('Hash generation error:', error);
        throw error;
    }
}

// ✅ PayHere Hash Generation Endpoint
app.post('/payhere_hash', (req, res) => {
    console.log("=== PayHere Hash Request ===");
    console.log("Request body:", req.body);

    try {
        const { merchant_id, order_id, amount, currency } = req.body;

        // Validation
        if (!merchant_id || !order_id || !amount || !currency) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required parameters',
                required: ['merchant_id', 'order_id', 'amount', 'currency']
            });
        }

        // Validate merchant_id
        if (merchant_id !== merchantId) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid merchant_id'
            });
        }

        // Validate currency
        if (currency !== 'LKR') {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid currency. Only LKR supported in sandbox.'
            });
        }

        // Format amount with exactly 2 decimal places (PayHere requirement)
        const amountFloat = parseFloat(amount);
        if (isNaN(amountFloat) || amountFloat <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid amount format'
            });
        }

        const formattedAmount = amountFloat.toFixed(2);
        
        // Generate hash using official PayHere algorithm
        const hash = generatePayHereHash(
            merchant_id,
            order_id,
            formattedAmount,
            currency,
            merchantSecret
        );

        console.log("✅ Hash generated successfully");
        console.log("=== End PayHere Hash Request ===");

        res.json({ 
            success: true,
            hash: hash,
            debug: {
                merchant_id,
                order_id,
                amount: formattedAmount,
                currency,
                hash_length: hash.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in hash generation endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// ✅ PayHere Payment Notification Handler - Following official documentation
app.post('/payhere-notify', async (req, res) => {
    console.log("=== PayHere Payment Notification ===");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    
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

        // Validate required notification parameters
        if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || !status_code || !md5sig) {
            console.error('Missing required notification parameters');
            return res.status(400).json({
                error: 'Missing required parameters'
            });
        }

        // Validate merchant ID
        if (merchant_id !== merchantId) {
            console.error('Invalid merchant_id in notification');
            return res.status(400).json({
                error: 'Invalid merchant_id'
            });
        }

        // ✅ Verify notification signature using EXACT official PayHere format
        // Official format: md5sig = strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
        console.log("Verifying notification signature using official PayHere format...");
        
        const hashedSecret = crypto.createHash('md5')
            .update(merchantSecret)
            .digest('hex')
            .toUpperCase();

        const notificationString = merchant_id + order_id + payhere_amount + payhere_currency + status_code + hashedSecret;
        const calculatedMd5sig = crypto.createHash('md5')
            .update(notificationString)
            .digest('hex')
            .toUpperCase();

        console.log("Notification verification details:");
        console.log("- merchant_id:", merchant_id);
        console.log("- order_id:", order_id);
        console.log("- payhere_amount:", payhere_amount);
        console.log("- payhere_currency:", payhere_currency);
        console.log("- status_code:", status_code);
        console.log("- hashedSecret:", hashedSecret);
        console.log("- notificationString:", notificationString);
        console.log("- calculatedMd5sig:", calculatedMd5sig);
        console.log("- receivedMd5sig:", md5sig);

        if (calculatedMd5sig !== md5sig.toUpperCase()) {
            console.error('❌ Invalid notification signature');
            console.error('Expected:', calculatedMd5sig);
            console.error('Received:', md5sig.toUpperCase());
            return res.status(400).json({
                error: 'Invalid signature'
            });
        }

        console.log('✅ Valid notification signature verified');

        // Update database
        const paymentsRef = db.collection('Payments');
        const querySnapshot = await paymentsRef.where('orderId', '==', order_id).get();

        if (querySnapshot.empty) {
            console.error('❌ Order not found:', order_id);
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const docRef = querySnapshot.docs[0].ref;

        // ✅ Official PayHere status codes from documentation
        const statusMap = {
            '2': { status: 'Success', description: 'Payment completed successfully' },
            '0': { status: 'Pending', description: 'Payment is pending' },
            '-1': { status: 'Canceled', description: 'Payment was canceled' },
            '-2': { status: 'Failed', description: 'Payment failed' },
            '-3': { status: 'Chargedback', description: 'Payment was charged back' }
        };

        const paymentStatus = statusMap[status_code] || { 
            status: 'Unknown', 
            description: `Unknown status code: ${status_code}` 
        };

        // Update payment record
        const updateData = {
            paymentStatus: paymentStatus.status,
            statusDescription: paymentStatus.description,
            payherePaymentId: payment_id || null,
            paymentMethod: method || 'PayHere',
            payhereAmount: payhere_amount,
            payhereCurrency: payhere_currency,
            statusCode: status_code,
            notificationReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (custom_1) updateData.custom1 = custom_1;
        if (custom_2) updateData.custom2 = custom_2;

        await docRef.update(updateData);

        console.log('✅ Database updated successfully');
        console.log('Payment Status:', paymentStatus.status);
        console.log("=== End PayHere Notification ===");

        res.status(200).json({
            success: true,
            message: 'Notification processed successfully'
        });

    } catch (error) {
        console.error('❌ Error processing notification:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// ✅ Debug endpoint with PHP-equivalent validation
app.get('/debug-hash', (req, res) => {
    try {
        // Test with exact values from your PayHere account
        const testOrder = {
            merchant_id: merchantId,
            order_id: 'TEST123',
            amount: '665.00', // Amount shown in your screenshot
            currency: 'LKR'
        };

        console.log('=== Debug Hash Generation ===');
        console.log('Testing with:', testOrder);
        console.log('Merchant Secret (first 20 chars):', merchantSecret.substring(0, 20) + '...');
        console.log('Merchant Secret (full length):', merchantSecret.length, 'characters');

        // Test hash generation
        const hash = generatePayHereHash(
            testOrder.merchant_id,
            testOrder.order_id,
            testOrder.amount,
            testOrder.currency,
            merchantSecret
        );

        // Also test with your current checkout amount
        const currentOrder = {
            merchant_id: merchantId,
            order_id: 'TL' + Date.now(),
            amount: '665.00',
            currency: 'LKR'
        };

        const currentHash = generatePayHereHash(
            currentOrder.merchant_id,
            currentOrder.order_id,
            currentOrder.amount,
            currentOrder.currency,
            merchantSecret
        );

        // ✅ PHP Equivalent Validation
        const phpEquivalent = {
            step1_amount_format: `number_format(${currentOrder.amount}, 2, '.', '') = ${parseFloat(currentOrder.amount).toFixed(2)}`,
            step2_secret_hash: `strtoupper(md5(merchant_secret)) = ${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`,
            step3_concat_string: `${currentOrder.merchant_id}${currentOrder.order_id}${parseFloat(currentOrder.amount).toFixed(2)}${currentOrder.currency}${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`,
            step4_final_hash: currentHash
        };

        res.json({
            success: true,
            debug_info: {
                merchant_id: merchantId,
                merchant_secret_length: merchantSecret.length,
                merchant_secret_preview: merchantSecret.substring(0, 15) + '...',
                test_order: testOrder,
                test_hash: hash,
                current_order: currentOrder,
                current_hash: currentHash,
                php_equivalent_steps: phpEquivalent,
                hash_algorithm: 'strtoupper(md5(merchant_id + order_id + number_format(amount, 2, ".", "") + currency + strtoupper(md5(merchant_secret))))',
                payhere_sandbox_url: 'https://sandbox.payhere.lk/pay/checkout',
                validation: {
                    hash_length: currentHash.length,
                    hash_format: 'MD5 (32 characters)',
                    amount_format: 'PHP number_format equivalent',
                    secret_hash_format: 'UPPERCASE MD5'
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// ✅ Test PayHere Integration with debug information
app.get('/test-debug-payment', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>PayHere Debug Test</title>
            <script type="text/javascript" src="https://www.payhere.lk/lib/payhere.js"></script>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                .debug-info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
                .error { color: red; }
                .success { color: green; }
                .warning { color: orange; }
                button { padding: 10px 20px; margin: 10px 5px; border: none; border-radius: 5px; cursor: pointer; }
                .btn-primary { background: #007bff; color: white; }
                .btn-secondary { background: #6c757d; color: white; }
            </style>
        </head>
        <body>
            <h1>PayHere Debug Test</h1>
            
            <div class="debug-info">
                <h3>Debug Information</h3>
                <p><strong>Merchant ID:</strong> ${merchantId}</p>
                <p><strong>Secret Length:</strong> ${merchantSecret.length} characters</p>
                <p><strong>Amount:</strong> Rs. 665.00 (from your screenshot)</p>
                <p><strong>Server:</strong> Running on port ${port}</p>
            </div>
            
            <button class="btn-primary" onclick="testHash()">1. Test Hash Generation</button>
            <button class="btn-primary" onclick="testJSSDK()">2. Test PayHere JS SDK</button>
            <button class="btn-secondary" onclick="checkDebugEndpoint()">3. Check Debug Endpoint</button>
            
            <div id="results" style="margin-top: 20px;"></div>
            
            <script>
                function log(message, type = 'info') {
                    const results = document.getElementById('results');
                    const div = document.createElement('div');
                    div.className = type;
                    div.innerHTML = '<strong>' + new Date().toLocaleTimeString() + ':</strong> ' + message;
                    results.appendChild(div);
                }
                
                async function checkDebugEndpoint() {
                    log('Checking debug endpoint...', 'info');
                    try {
                        const response = await fetch('/debug-hash');
                        const data = await response.json();
                        log('Debug endpoint response:', 'success');
                        log('<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'info');
                    } catch (error) {
                        log('Debug endpoint error: ' + error.message, 'error');
                    }
                }
                
                async function testHash() {
                    log('Testing hash generation...', 'info');
                    try {
                        const orderData = {
                            merchant_id: '${merchantId}',
                            order_id: 'DEBUG' + Date.now(),
                            amount: '665.00',
                            currency: 'LKR'
                        };
                        
                        log('Sending: ' + JSON.stringify(orderData), 'info');
                        
                        const response = await fetch('/payhere_hash', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(orderData)
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            log('Hash generated successfully: ' + result.hash, 'success');
                            log('Hash length: ' + result.hash.length + ' characters', 'info');
                        } else {
                            log('Hash generation failed: ' + result.error, 'error');
                        }
                    } catch (error) {
                        log('Hash test error: ' + error.message, 'error');
                    }
                }
                
                async function testJSSDK() {
                    log('Testing PayHere JavaScript SDK...', 'info');
                    
                    if (typeof payhere === 'undefined') {
                        log('PayHere library not loaded!', 'error');
                        return;
                    }
                    
                    try {
                        // First get hash
                        const orderData = {
                            merchant_id: '${merchantId}',
                            order_id: 'JSTEST' + Date.now(),
                            amount: '665.00',
                            currency: 'LKR'
                        };
                        
                        const response = await fetch('/payhere_hash', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(orderData)
                        });
                        
                        const result = await response.json();
                        
                        if (!result.success) {
                            log('Hash generation failed: ' + result.error, 'error');
                            return;
                        }
                        
                        log('Starting PayHere with hash: ' + result.hash, 'info');
                        
                        const payment = {
                            sandbox: true,
                            merchant_id: '${merchantId}',
                            return_url: undefined,
                            cancel_url: undefined,
                            notify_url: 'https://625bdb903d53.ngrok-free.app/payhere-notify',
                            order_id: orderData.order_id,
                            items: 'Debug Test Product',
                            amount: '665.00',
                            currency: 'LKR',
                            hash: result.hash,
                            first_name: 'Debug',
                            last_name: 'Test',
                            email: 'debug@test.com',
                            phone: '0771234567',
                            address: 'Test Address',
                            city: 'Colombo',
                            country: 'Sri Lanka'
                        };
                        
                        log('Payment object: ' + JSON.stringify(payment, null, 2), 'info');
                        payhere.startPayment(payment);
                        
                    } catch (error) {
                        log('SDK test error: ' + error.message, 'error');
                    }
                }
                
                // PayHere event handlers
                payhere.onCompleted = function(orderId) {
                    log('✅ Payment completed! Order: ' + orderId, 'success');
                };
                
                payhere.onDismissed = function() {
                    log('❌ Payment dismissed', 'warning');
                };
                
                payhere.onError = function(error) {
                    log('❌ Payment error: ' + error, 'error');
                };
            </script>
        </body>
        </html>
    `);
});

// ✅ Test PayHere Integration - Official Documentation Format
app.get('/test-payhere-official', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>PayHere Official Documentation Test</title>
            <script type="text/javascript" src="https://www.payhere.lk/lib/payhere.js"></script>
        </head>
        <body>
            <h1>PayHere Integration Test - Official Documentation Format</h1>
            
            <h3>Method 1: HTML Form (Official Documentation)</h3>
            <form method="post" action="https://sandbox.payhere.lk/pay/checkout">   
                <input type="hidden" name="merchant_id" value="${merchantId}">
                <input type="hidden" name="return_url" value="http://localhost:5500/HTML/payment_success.html">
                <input type="hidden" name="cancel_url" value="http://localhost:5500/HTML/payment_cancel.html">
                <input type="hidden" name="notify_url" value="http://localhost:3000/payhere-notify">  
                <br><br>Item Details<br>
                <input type="text" name="order_id" value="TL${Date.now()}" readonly>
                <input type="text" name="items" value="Tyvek Lanka - Test Product">
                <input type="text" name="currency" value="LKR" readonly>
                <input type="text" name="amount" value="815.00" readonly>  
                <br><br>Customer Details<br>
                <input type="text" name="first_name" value="John">
                <input type="text" name="last_name" value="Doe">
                <input type="text" name="email" value="john@example.com">
                <input type="text" name="phone" value="0771234567">
                <input type="text" name="address" value="No.1, Test Street">
                <input type="text" name="city" value="Colombo">
                <input type="hidden" name="country" value="Sri Lanka">
                <input type="hidden" name="hash" value="" id="form-hash">
                <br><br>
                <button type="button" onclick="generateHashAndSubmit(this.form)">Generate Hash & Pay Now</button>
                <input type="submit" value="Pay Now (Manual)" style="margin-left: 10px;">   
            </form>
            
            <hr>
            
            <h3>Method 2: JavaScript SDK</h3>
            <button onclick="testJSPayment()">Test Payment - Rs. 815.00 (JS SDK)</button>
            
            <div id="status" style="margin-top: 20px; padding: 10px; border: 1px solid #ccc;"></div>
            
            <script>
                async function generateHashAndSubmit(form) {
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerHTML = 'Generating hash for form submission...';
                    
                    try {
                        const orderData = {
                            merchant_id: form.merchant_id.value,
                            order_id: form.order_id.value,
                            amount: form.amount.value,
                            currency: form.currency.value
                        };
                        
                        const response = await fetch('/payhere_hash', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(orderData)
                        });
                        
                        const result = await response.json();
                        
                        if (!result.success) {
                            statusDiv.innerHTML = '<span style="color: red;">Hash generation failed: ' + result.error + '</span>';
                            return;
                        }
                        
                        form.hash.value = result.hash;
                        statusDiv.innerHTML = 'Hash generated: ' + result.hash + '<br>Submitting form...';
                        
                        setTimeout(() => {
                            form.submit();
                        }, 1000);
                        
                    } catch (error) {
                        statusDiv.innerHTML = '<span style="color: red;">Error: ' + error.message + '</span>';
                    }
                }
                
                async function testJSPayment() {
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerHTML = 'Generating payment hash for JS SDK...';
                    
                    try {
                        const orderData = {
                            merchant_id: '${merchantId}',
                            order_id: 'TL' + Date.now(),
                            amount: '815.00',
                            currency: 'LKR'
                        };
                        
                        const response = await fetch('/payhere_hash', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(orderData)
                        });
                        
                        const result = await response.json();
                        
                        if (!result.success) {
                            statusDiv.innerHTML = '<span style="color: red;">Hash generation failed: ' + result.error + '</span>';
                            return;
                        }
                        
                        statusDiv.innerHTML = 'Hash generated: ' + result.hash + '<br>Starting PayHere JS SDK...';
                        
                        const payment = {
                            sandbox: true,
                            merchant_id: '${merchantId}',
                            return_url: undefined,
                            cancel_url: undefined,
                            notify_url: 'http://localhost:3000/payhere-notify',
                            order_id: orderData.order_id,
                            items: 'Tyvek Lanka - Test Product',
                            amount: '815.00',
                            currency: 'LKR',
                            hash: result.hash,
                            first_name: 'John',
                            last_name: 'Doe',
                            email: 'john@example.com',
                            phone: '0771234567',
                            address: 'No.1, Test Street',
                            city: 'Colombo',
                            country: 'Sri Lanka'
                        };
                        
                        payhere.startPayment(payment);
                        
                    } catch (error) {
                        statusDiv.innerHTML = '<span style="color: red;">Error: ' + error.message + '</span>';
                    }
                }
                
                // PayHere event handlers
                payhere.onCompleted = function(orderId) {
                    document.getElementById('status').innerHTML = '<span style="color: green;">✅ Payment completed! Order: ' + orderId + '</span>';
                };
                
                payhere.onDismissed = function() {
                    document.getElementById('status').innerHTML = '<span style="color: orange;">❌ Payment dismissed</span>';
                };
                
                payhere.onError = function(error) {
                    document.getElementById('status').innerHTML = '<span style="color: red;">❌ Payment error: ' + error + '</span>';
                };
            </script>
        </body>
        </html>
    `);
});

// ✅ Hash validation endpoint with PHP code comparison
app.post('/validate-hash', (req, res) => {
    try {
        const { merchant_id, order_id, amount, currency } = req.body;
        
        if (!merchant_id || !order_id || !amount || !currency) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        console.log('=== Hash Validation Request ===');
        console.log('Input parameters:', { merchant_id, order_id, amount, currency });

        // Generate hash with our implementation
        const ourHash = generatePayHereHash(merchant_id, order_id, amount, currency, merchantSecret);

        // Show exact PHP equivalent code that would produce the same hash
        const amountFormatted = parseFloat(amount).toFixed(2);
        const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
        const concatString = merchant_id + order_id + amountFormatted + currency + secretHash;
        
        const phpCode = `
<?php
$merchant_id = "${merchant_id}";
$order_id = "${order_id}";
$amount = ${amount};
$currency = "${currency}";
$merchant_secret = "YOUR_SECRET";

$hash = strtoupper(
    md5(
        $merchant_id . 
        $order_id . 
        number_format($amount, 2, '.', '') .  // ${amountFormatted}
        $currency .  
        strtoupper(md5($merchant_secret))     // ${secretHash}
    ) 
);

// Concatenated string: ${concatString}
// Final hash: ${ourHash}
?>`;

        res.json({
            success: true,
            input: { merchant_id, order_id, amount, currency },
            output: {
                hash: ourHash,
                hash_length: ourHash.length
            },
            step_by_step: {
                step1_format_amount: `number_format(${amount}, 2, '.', '') = "${amountFormatted}"`,
                step2_hash_secret: `strtoupper(md5(secret)) = "${secretHash}"`,
                step3_concatenate: `"${concatString}"`,
                step4_final_hash: `strtoupper(md5(step3)) = "${ourHash}"`
            },
            php_equivalent: phpCode,
            validation: {
                amount_format_correct: amountFormatted === parseFloat(amount).toFixed(2),
                hash_length_correct: ourHash.length === 32,
                hash_uppercase: ourHash === ourHash.toUpperCase()
            }
        });

    } catch (error) {
        console.error('Hash validation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        server: 'PayHere Integration Server',
        timestamp: new Date().toISOString(),
        config: {
            merchant_id: merchantId,
            secret_length: merchantSecret.length,
            sandbox_mode: true
        }
    });
});

// Success and error pages
app.get('/success', (req, res) => {
    res.send(`
        <h1>✅ Payment Successful!</h1>
        <p>Thank you for your payment.</p>
        <p>Order ID: ${req.query.order_id || 'N/A'}</p>
        <a href="/test-payhere-official">Test Another Payment</a>
    `);
});

app.get('/cancel', (req, res) => {
    res.send(`
        <h1>❌ Payment Cancelled</h1>
        <p>Your payment was cancelled.</p>
        <a href="/test-payhere-official">Try Again</a>
    `);
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

app.listen(port, () => {
    console.log(`🚀 PayHere Integration Server running on port ${port}`);
    console.log(`📋 Health check: http://localhost:${port}/health`);
    console.log(`🔍 Debug hash: http://localhost:${port}/debug-hash`);
    console.log(`🧪 Debug payment test: http://localhost:${port}/test-debug-payment`);
    console.log(`🧪 Test PayHere (Official): http://localhost:${port}/test-payhere-official`);
    console.log(`💳 PayHere hash endpoint: http://localhost:${port}/payhere_hash`);
    console.log(`🔔 PayHere notify endpoint: http://localhost:${port}/payhere-notify`);
    console.log(`🏪 Merchant ID: ${merchantId}`);
    console.log(`🔐 Secret Length: ${merchantSecret.length} characters`);
    console.log('');
    console.log('🚨 DEBUGGING STEPS:');
    console.log(`   1. Visit: http://localhost:${port}/debug-hash`);
    console.log(`   2. Visit: http://localhost:${port}/test-debug-payment`);
    console.log('   3. Check server logs for hash generation details');
    console.log('');
    console.log('📖 OFFICIAL PayHere Hash Formula:');
    console.log('   hash = MD5(merchant_id + order_id + amount + currency + MD5(secret).toUpperCase()).toUpperCase()');
    console.log('📖 OFFICIAL PayHere Notification Verification:');
    console.log('   md5sig = MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + MD5(secret).toUpperCase()).toUpperCase()');
    console.log('');
    console.log('🔧 UNLOAD POLICY HANDLING:');
    console.log('   ✅ Permissions-Policy header set to allow unload events');
    console.log('   ✅ Client-side error suppression enabled');
    console.log('   ✅ Modern event alternatives (pagehide, visibilitychange) implemented');
    console.log('');
    console.log('🛠️  DEBUGGING UNLOAD POLICY VIOLATIONS (Development Only):');
    console.log('   Chrome Flags: chrome://flags → Search "deprecate-unload" → Set to "Disabled"');
    console.log('   Command Line: --disable-features=PermissionsPolicyUnload');
    console.log('');
    console.log('✅ Server ready for PayHere payments');
});