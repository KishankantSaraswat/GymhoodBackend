import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:8000/upload';
const TEST_FILE_PATH = 'test_upload_file.txt';

// Create a dummy file
fs.writeFileSync(TEST_FILE_PATH, 'This is a test file for upload verification.');

const verifyUpload = async () => {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(TEST_FILE_PATH));

        console.log(`Uploading to ${API_URL}...`);
        const response = await axios.post(API_URL, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        console.log('Response:', response.data);

        if (response.data.success && response.data.url.startsWith('http')) {
            console.log('✅ verification PASSED: URL is absolute.');
        } else {
            console.error('❌ verification FAILED: URL is not absolute or upload failed.');
            console.error('URL:', response.data.url);
        }

    } catch (error) {
        console.error('❌ Error during verification:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    } finally {
        // Cleanup
        if (fs.existsSync(TEST_FILE_PATH)) {
            fs.unlinkSync(TEST_FILE_PATH);
        }
    }
};

verifyUpload();
