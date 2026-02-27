const { client, fromNumber, accountSid, flowSid } = require('./twilio_client');

// State definition
class CallState {
    constructor(toNumber, urlForTwiML) {
        this.toNumber = toNumber;
        this.urlForTwiML = urlForTwiML || `https://webhooks.twilio.com/v1/Accounts/${accountSid}/Flows/${flowSid}`;
        this.callSid = null;
        this.status = 'pending';
        this.error = null;
    }
}

// Nodes
async function initiateCallNode(state) {
    try {
        const call = await client.calls.create({
            to: state.toNumber,
            from: fromNumber,
            url: state.urlForTwiML,
            method: 'POST',
            statusCallback: state.urlForTwiML,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['completed']
        });
        
        state.callSid = call.sid;
        state.status = 'initiated';
        console.log(`Call initiated: ${call.sid}`);
        return state;
    } catch (error) {
        state.error = error.message;
        state.status = 'failed';
        console.error('Call failed:', error.message);
        return state;
    }
}

// Router
function shouldRetry(state) {
    return state.status === 'failed' && !state.error.includes('invalid') ? 'retry' : 'end';
}

// Graph execution
async function executeCallGraph(toNumber, urlForTwiML) {
    const state = new CallState(toNumber, urlForTwiML);
    
    // Execute nodes
    const result = await initiateCallNode(state);
    
    if (result.status === 'failed') {
        throw new Error(result.error);
    }
    
    return {
        sid: result.callSid,
        status: result.status,
        to: result.toNumber
    };
}

module.exports = { executeCallGraph, CallState };
