const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function testUpload() {
    try {
        // Create a test CSV with different column naming variations
        const testCSV1 = `caller,receiver,duration,date,time,type,location
9876543210,1234567890,45,2024-01-15,10:30:00,outgoing,New York
1234567890,5555555555,120,2024-01-15,11:45:00,incoming,Los Angeles`;

        const testCSV2 = `caller_number,receiver_number,call_duration,call_date,call_time,call_type,city
9876543210,1234567890,45,2024-01-15,10:30:00,outgoing,New York
1234567890,5555555555,120,2024-01-15,11:45:00,incoming,Los Angeles`;

        const testCSV3 = `from,to,seconds,calldate,direction
9876543210,1234567890,45,2024-01-15 10:30:00,outbound
1234567890,5555555555,120,2024-01-15 11:45:00,inbound`;

        // Write test files
        fs.writeFileSync('test1.csv', testCSV1);
        fs.writeFileSync('test2.csv', testCSV2);
        fs.writeFileSync('test3.csv', testCSV3);

        // Test each CSV format
        for (let i = 1; i <= 3; i++) {
            console.log(`\nTesting CSV format ${i}...`);
            const form = new FormData();
            form.append('file', fs.createReadStream(`test${i}.csv`));
            
            try {
                const response = await axios.post('http://localhost:5000/api/cdr/upload', form, {
                    headers: {
                        ...form.getHeaders()
                    }
                });
                console.log('Success:', response.data);
            } catch (error) {
                console.error('Error:', error.response?.data || error.message);
            }
        }

        // Cleanup
        fs.unlinkSync('test1.csv');
        fs.unlinkSync('test2.csv');
        fs.unlinkSync('test3.csv');

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testUpload();