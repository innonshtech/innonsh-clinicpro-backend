/**
 * Mock SMS Service for Doctor ERP System
 * Currently logs the message to the console for testing logic without spending credits.
 * In the future, this can be swapped with a real Twilio or Fast2SMS integration.
 */

export const sendSMS = async (phoneNumber, message) => {
  try {
    // 1. Simulate network delay (e.g., 500ms)
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Format the log beautifully so it's easy to spot in the terminal
    console.log('\n' + '='.repeat(60));
    console.log('📱 MOCK SMS SERVICE DISPATCH');
    console.log('='.repeat(60));
    console.log(`To      : ${phoneNumber}`);
    console.log(`Status  : DELIVERED (Mock)`);
    console.log(`Message :\n${message}`);
    console.log('='.repeat(60) + '\n');

    // Return success
    return {
      success: true,
      messageId: `mock_sms_${Date.now()}`
    };
  } catch (error) {
    console.error('Mock SMS failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
