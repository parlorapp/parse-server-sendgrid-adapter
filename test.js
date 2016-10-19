var SimpleSendGridAdapter = require('./index.js');

var adapter = SimpleSendGridAdapter({
    apiKey: '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',
    fromAddress: 'Parlor <password@parlor.me>',
  });

var ref = {"to": "brian@parlor.me", "subject": "Test", "text": "Disregard this email"};
adapter.sendMail(ref);
