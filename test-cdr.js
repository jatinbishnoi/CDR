const fs = require('fs');
const path = require('path');

// Create a sample CSV file for testing
function createSampleCSV() {
    const sampleData = [
        'caller,receiver,duration,date,time,type,location',
        '1234567890,9876543210,120,2024-01-15,10:30:00,outgoing,New York',
        '1234567890,5555555555,45,2024-01-15,11:45:00,outgoing,New York',
        '9876543210,1234567890,30,2024-01-15,14:20:00,incoming,Los Angeles',
        '5555555555,1234567890,90,2024-01-16,09:15:00,outgoing,Chicago',
        '1234567890,7777777777,60,2024-01-16,16:00:00,outgoing,New York',
        '7777777777,1234567890,15,2024-01-17,10:00:00,incoming,Boston',
        '9876543210,5555555555,180,2024-01-17,13:30:00,outgoing,Los Angeles',
        '5555555555,9876543210,75,2024-01-18,11:20:00,incoming,Chicago',
        '1234567890,1111111111,200,2024-01-18,15:45:00,outgoing,New York',
        '1111111111,1234567890,25,2024-01-19,09:30:00,incoming,Miami'
    ];

    const filePath = path.join(__dirname, 'uploads', 'sample-cdr.csv');
    fs.writeFileSync(filePath, sampleData.join('\n'));
    console.log(`Sample CSV created at: ${filePath}`);
}

createSampleCSV();