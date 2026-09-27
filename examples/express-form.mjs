// An Express server that forwards a contact form to AgentFaro. The form posts here, so the
// API key never reaches the browser.
//   npm install express
//   AGENTFARO_API_KEY=af_live_… node examples/express-form.mjs
import express from 'express';
import { AgentFaro, ValidationError } from '@agentfaro/sdk';

const agentfaro = new AgentFaro();
const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/contact', async (req, res) => {
  try {
    await agentfaro.leads.create(
      {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        message: req.body.message,
        sourceUrl: req.get('referer'),
      },
      // The form's own submission ID makes a double-clicked submit land once.
      { idempotencyKey: req.body.submission_id || undefined },
    );
    res.redirect(303, '/thanks');
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).send(`Please check the ${error.field} field.`);
      return;
    }
    console.error(error);
    res.status(502).send('We could not send your message. Please try again in a minute.');
  }
});

app.listen(3000, () => console.log('Listening on http://localhost:3000'));
