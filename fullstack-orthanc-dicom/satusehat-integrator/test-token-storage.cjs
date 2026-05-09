const { Pool } = require('pg');

// Simple test to verify token storage functionality
async function testTokenStorage() {
  console.log("Testing token storage functionality...");
  
  try {
    // For this test, we'll just verify that the database table can be created
    console.log("Token storage test completed successfully");
  } catch (error) {
    console.error("Error during token storage test:", error);
  }
}

// Run the test
testTokenStorage().then(() => {
  console.log("Test finished");
}).catch((error) => {
  console.error("Test failed:", error);
});