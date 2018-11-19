'use strict';

var _sendgrid = require('sendgrid');
var _helper = require('sendgrid').mail;
var validator = require("email-validator");
var fs = require('fs');

function checkSuppression(sg, suppression, email, callback)
{
    var request = sg.emptyRequest();
    request.method = 'GET';
    var path = '/v3/suppression/' + suppression + '/' + encodeURIComponent(email);
    console.log("parse-server-sendgrid-adapter: Testing Email " + path);
    request.path = path;
    sg.API(request, function (error, response) {
      try
      {
          var resp_body = response.body
          console.log("parse-server-sendgrid-adapter: Respone from suppression check " + suppression + " : " + resp_body);
          if (resp_body.length > 0)
          {
              var jsonresp = JSON.parse(response.body);
              var result = (jsonresp.length == 0);
              callback(result, email);
          } else {
              callback(true, email);
          }
      } catch (err) {
          console.log("parse-server-sendgrid-adapter: Error - " + err);
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
                            console.log("parse-server-sendgrid-adapter: Stopped by checkSuppression bounces " + email);
                        }
                        callback(result);
                    });
                } else {
                    console.log("parse-server-sendgrid-adapter: Stopped by checkSuppression invalid_emails " + email);
                    callback(result);
                }
            });
        } else {
            console.log("parse-server-sendgrid-adapter: Stopped by email validator " + email);
            callback(false);
        }
    } catch (err) {
        callback(false);
    }
}

function sendEmail(sg, from, to, subject, contenttype, text, callback)
{
    var from_email = new _helper.Email(from);
    var to_email = new _helper.Email(to);
    var content = new _helper.Content(contenttype, text);
    var mail = new _helper.Mail(from_email, subject, to_email, content);
    console.log("parse-server-sendgrid-adapter: Sending Email to " + to + " with subject " + subject);
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

function escapeRegExp(str)
{
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

function replaceAll(str, find, replace)
{
    return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

function fillVariables(text, options)
{
    text = replaceAll(text, "{{link}}", options.link);
    return text;
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
    var contenttype = 'text/plain';
    console.log("Sending Email to " + to + " with subject: " + subject);
    var pwResetPath = "templates/password_reset_email.html";
    if (subject.startsWith("Password") && fs.existsSync(pwResetPath))
    {
        contenttype = "text/html";
        text = fillVariables(fs.readFileSync(pwResetPath)+'', mailOptions);
        console.log("Loaded custom password reset " + text);
    }

    return new Promise(function (resolve, reject) {
      checkInvalidEmail(sendgrid, to, function(result)
      {
         if (result)
         {
            sendEmail(sendgrid, mailOptions.fromAddress, to, subject, contenttype, text, function (err, response_body)
            {
              if (err)
              {
                console.log("parse-server-sendgrid-adapter: Error Sending " + err + " " + response_body);
                reject(err);
              } else {
                console.log("parse-server-sendgrid-adapter: Email sent to " + to);
              }
              resolve({ "response": response_body });
            });
         } else {
            console.log("parse-server-sendgrid-adapter: Email not sent to " + to);
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
