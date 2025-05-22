// /netlify/functions/get-config.js
exports.handler = async function (event, context) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        GIST_ID: process.env.GIST_ID,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        CHAT_FILENAME: process.env.CHAT_FILENAME,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
        DISCOGS_CONSUMER_KEY: process.env.DISCOGS_CONSUMER_KEY || "",
        DISCOGS_CONSUMER_SECRET: process.env.DISCOGS_CONSUMER_SECRET || ""
      })
    };
  };
  