import { Pool } from "pg";
import { config } from "./config";
import { getPool, initTokenStorageTable, saveToken } from "./db";

async function testTokenStorage() {
  console.log("Testing token storage functionality...");
  
  try {
    // Initialize database connection
    const pool = await getPool();
    if (!pool) {
      console.log("Failed to connect to database");
      return;
    }
    
    console.log("Connected to database successfully");
    
    // Initialize token storage table
    await initTokenStorageTable();
    console.log("Token storage table initialized");
    
    // Test saving a sample token
    const sampleToken = {
      clientId: config.clientId || "test-client-id",
      organizationName: "test-organization",
      developerEmail: "test@example.com",
      tokenType: "BearerToken",
      accessToken: "test-access-token-12345",
      refreshToken: "test-refresh-token-67890",
      expiresIn: 3600,
      issuedAt: Date.now(),
      scope: "",
      status: "approved",
      rawResponse: {
        "refresh_token_expires_in": "0",
        "api_product_list": "[api-sandbox]",
        "organization_name": "test-organization",
        "developer.email": "test@example.com",
        "token_type": "BearerToken",
        "issued_at": Date.now().toString(),
        "client_id": config.clientId || "test-client-id",
        "access_token": "test-access-token-12345",
        "application_name": "test-application",
        "scope": "",
        "expires_in": "3600",
        "refresh_count": "0",
        "status": "approved"
      },
      requestData: {
        grant_type: "client_credentials",
        client_id: config.clientId || "test-client-id"
      }
    };
    
    const tokenId = await saveToken(sampleToken);
    if (tokenId) {
      console.log(`Successfully saved token with ID: ${tokenId}`);
    } else {
      console.log("Failed to save token");
    }
    
    // Query the saved token to verify
    const result = await pool.query("SELECT * FROM satusehat_tokens WHERE id = $1", [tokenId]);
    if (result.rows.length > 0) {
      console.log("Retrieved token from database:");
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log("Failed to retrieve saved token");
    }
    
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