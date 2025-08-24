// Test script to verify the source password system
const API_BASE_URL = 'http://localhost:3001/api';

async function testPasswordSystem() {
    console.log('Testing Source Password System');
    console.log('================================');

    try {
        // Test 1: Create a new source
        console.log('1. Creating new source "TestSource"...');
        const createResponse = await fetch(`${API_BASE_URL}/sources/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'TestSource',
                password: 'testpass123'
            })
        });
        
        const createResult = await createResponse.json();
        console.log('Create result:', createResult);

        // Test 2: Validate correct password
        console.log('\n2. Validating correct password...');
        const validateCorrectResponse = await fetch(`${API_BASE_URL}/sources/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'TestSource',
                password: 'testpass123'
            })
        });
        
        const validateCorrectResult = await validateCorrectResponse.json();
        console.log('Validation result (correct):', validateCorrectResult);

        // Test 3: Validate incorrect password
        console.log('\n3. Validating incorrect password...');
        const validateIncorrectResponse = await fetch(`${API_BASE_URL}/sources/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'TestSource',
                password: 'wrongpassword'
            })
        });
        
        const validateIncorrectResult = await validateIncorrectResponse.json();
        console.log('Validation result (incorrect):', validateIncorrectResult);

        // Test 4: Try to create duplicate source
        console.log('\n4. Trying to create duplicate source...');
        const duplicateResponse = await fetch(`${API_BASE_URL}/sources/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'TestSource',
                password: 'anotherpass'
            })
        });
        
        const duplicateResult = await duplicateResponse.json();
        console.log('Duplicate source result:', duplicateResult);

        // Test 5: List all sources
        console.log('\n5. Listing all sources...');
        const listResponse = await fetch(`${API_BASE_URL}/sources/list`);
        const listResult = await listResponse.json();
        console.log('Sources list:', listResult);

        // Test 6: Test character save with correct password
        console.log('\n6. Testing character save with correct password...');
        const testCharacter = {
            name: 'Test Character',
            source: 'TestSource',
            race: { name: 'Human', source: 'PHB' },
            class: [{ name: 'Fighter', source: 'PHB', level: 1 }]
        };

        const saveResponse = await fetch(`${API_BASE_URL}/characters/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: 'TestSource-characters.json',
                character: testCharacter,
                source: 'TestSource',
                password: 'testpass123'
            })
        });

        const saveResult = await saveResponse.json();
        console.log('Character save result:', saveResult);

        // Test 7: Test character save with incorrect password
        console.log('\n7. Testing character save with incorrect password...');
        const saveFailResponse = await fetch(`${API_BASE_URL}/characters/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: 'TestSource-characters.json',
                character: testCharacter,
                source: 'TestSource',
                password: 'wrongpassword'
            })
        });

        const saveFailResult = await saveFailResponse.json();
        console.log('Character save fail result:', saveFailResult);

        console.log('\n✅ Password system tests completed!');
        console.log('\nExpected results:');
        console.log('- Create should succeed');
        console.log('- Correct password validation should return valid: true');
        console.log('- Incorrect password validation should return valid: false');
        console.log('- Duplicate source creation should fail');
        console.log('- Sources list should show TestSource');
        console.log('- Character save with correct password should succeed');
        console.log('- Character save with wrong password should fail with 403');

    } catch (error) {
        console.error('Test error:', error);
    }
}

// Only run if this is the main module (not imported)
if (require.main === module) {
    testPasswordSystem();
}

module.exports = { testPasswordSystem };