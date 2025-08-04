const crypto = require('crypto');

// 1. Paste the exact "Hashed Secret" from your terminal here
const hashedSecret = '43C21F464A89B250F391E52767AD2FF0';

// 2. Paste the exact "String to be hashed" from your terminal here
const stringToBeHashed = '1231507Order1754284414993539.00LKR43C21F464A89B250F391E52767AD2FF0';

// --- You don't need to change anything below this line ---

// Generate the final hash using the same method as your server
const finalHash = crypto.createHash('md5').update(stringToBeHashed).digest('hex').toUpperCase();

console.log('Final hash from manual verification:', finalHash);
console.log('Does it match the terminal log?', finalHash === '4C8A4C78904615EA1C273C4EB8AFB1A8');