// /netlify/functions/get-config.js
exports.handler = async function (event, context) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        GIST_ID: process.env.GIST_ID,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        CHAT_FILENAME: process.env.CHAT_FILENAME
      })
    };
  };
  