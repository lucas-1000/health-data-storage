import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function addClaudeCallback() {
  console.log('🔧 Adding Claude callback URL to Food MCP OAuth client...\n');

  try {
    // Add Claude's callback URL to the existing food-mcp-production client
    const claudeCallbackUrl = 'https://claude.ai/api/mcp/auth_callback';
    const futureClaudeCallbackUrl = 'https://claude.com/api/mcp/auth_callback';

    const result = await pool.query(
      `UPDATE oauth_clients
       SET redirect_uris = array_cat(
         redirect_uris,
         ARRAY[$1::text, $2::text]
       )
       WHERE client_id = 'food-mcp-production'
         AND NOT ($1 = ANY(redirect_uris))
         AND NOT ($2 = ANY(redirect_uris))
       RETURNING *`,
      [claudeCallbackUrl, futureClaudeCallbackUrl]
    );

    if (result.rows.length > 0) {
      console.log('✅ Successfully added Claude callback URLs!');
      console.log('\nUpdated OAuth Client:');
      console.log(`   Client ID: ${result.rows[0].client_id}`);
      console.log(`   Name: ${result.rows[0].name}`);
      console.log(`   Allowed Redirect URIs:`);
      result.rows[0].redirect_uris.forEach((uri: string) => {
        console.log(`     - ${uri}`);
      });
      console.log('\n✨ Your OAuth client now supports both ChatGPT and Claude!\n');
    } else {
      console.log('ℹ️  Claude callback URLs already exist or client not found.');

      // Show current redirect URIs
      const current = await pool.query(
        `SELECT redirect_uris FROM oauth_clients WHERE client_id = 'food-mcp-production'`
      );

      if (current.rows.length > 0) {
        console.log('\nCurrent redirect URIs:');
        current.rows[0].redirect_uris.forEach((uri: string) => {
          console.log(`  - ${uri}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error adding Claude callback:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addClaudeCallback();
