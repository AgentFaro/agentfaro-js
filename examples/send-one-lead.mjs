// Send one lead from the command line:
//   AGENTFARO_API_KEY=af_live_… node examples/send-one-lead.mjs
import { AgentFaro, AgentFaroError } from '@agentfaro/sdk';

const agentfaro = new AgentFaro();

try {
  const lead = await agentfaro.leads.create({
    name: 'Jordan Rivera',
    email: 'jordan@example.com',
    phone: '(312) 555-0142',
    message: 'Could you send me recent sales for three-bedroom homes on my street?',
    sourceUrl: 'https://www.example.com/home-value/',
  });
  console.log(`Lead ${lead.id} ${lead.status}.`);
} catch (error) {
  if (error instanceof AgentFaroError) {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
