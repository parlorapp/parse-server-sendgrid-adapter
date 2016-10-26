'use strict';

var _sendgrid = require('sendgrid');
var _helper = require('sendgrid').mail;
var validator = require("email-validator");

function checkSuppression(sg, suppression, email, callback)
{
    var request = sg.emptyRequest();
    request.method = 'GET';
    var path = '/v3/suppression/' + suppression + '/' + encodeURIComponent(email);
    console.log("Testing Email: " + path);
    request.path = path;
    sg.API(request, function (error, response) {
      try
      {
          console.log("MailAdapter Respone from suppression check " + suppression + " : " + response.body);
          var jsonresp = JSON.parse(response.body);
          var result = (jsonresp.length == 0);
          callback(result, email);
      } catch (err) {
          console.log("Mail Adapter Error - " + err);
          callback(false, email);
      }
    });
}

function checkInvalidEmail(sg, email, callback)
{
    try
    {
        if (validator.validate(email))
        {
            checkSuppression(sg, 'invalid_emails' , email, function(result, email)
            {
                if (result)
                {
                    checkSuppression(sg, 'bounces', email, function(result, email)
                    {
                        if (!result)
                        {
                            console.log("Stopped by checkSuppression bounces: " + email);
                        }
                        callback(result);
                    });
                } else {
                    console.log("Stopped by checkSuppression invalid_emails: " + email);
                    callback(result);
                }
            });
        } else {
            console.log("Stopped by email validator: " + email);
            callback(false);
        }
    } catch (err) {
        callback(false);
    }
}

function sendEmail(sg, from, to, subject, text, callback)
{
    var from_email = new _helper.Email(from);
    var to_email = new _helper.Email(to);
    var content = new _helper.Content('text/plain', text);
    var mail = new _helper.Mail(from_email, subject, to_email, content);
    var request = sg.emptyRequest({
      method: 'POST',
      path: '/v3/mail/send',
      body: mail.toJSON(),
    });
    sg.API(request, function(error, response) {
      if (response.statusCode >= 200 && response.statusCode <= 299)
      {
        callback(false, response.body);
      } else {
        callback(response.statusCode, response.body);
      }
    });
}

var SimpleSendGridAdapter = function SimpleSendGridAdapter(mailOptions) {
  if (!mailOptions || !mailOptions.apiKey || !mailOptions.fromAddress) {
    throw 'SimpleSendGridAdapter requires an API Key.';
  }
  var sendgrid = _sendgrid(mailOptions.apiKey);

  var sendMail = function sendMail(_ref) {
    var to = _ref.to;
    var subject = _ref.subject;
    var text = _ref.text;

    return new Promise(function (resolve, reject) {
      checkInvalidEmail(sendgrid, to, function(result)
      {
         if (result)
         {
            sendEmail(sendgrid, mailOptions.fromAddress, to, subject, text, function (err, response_body)
            {
              if (err) {
                reject(err);
              } else {
                console.log("Email sent to: " + to);
              }
              resolve({ "response": response_body });
            });
         } else {
            console.log("Email not sent to: " + to);
            reject("Email not sent to: " + to);
         }
       });
    });
  };

  return Object.freeze({
    sendMail: sendMail
  });
};

module.exports = SimpleSendGridAdapter;
