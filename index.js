'use strict';

var _sendgrid = require('sendgrid');
var _helper = require('sendgrid').mail;
var validator = require("email-validator");
var fs = require('fs');
var http = require('http');
var https = require('https');

async function requestResetUrl(provider, email)
{
    return await new Promise((resolve, reject) => {
        var request = https.get(provider + "?email=" + encodeURIComponent(email), res => {
          if (res.statusCode < 200 || res.statusCode > 299) {
            reject(new Error('Failed to load page, status code: ' + res.statusCode));
          }
          res.setEncoding("utf8");
          let body = "";
          res.on("data", data => {
            body += data;
          });
          res.on("end", () => {
            console.log("Parsed Response: " + body);
            body = JSON.parse(body);
            resolve(body.resetUrl);
          });
        });
        request.on('error', (err) => {
          console.log("Rejected HTTP REQUEST: " + err);
          reject(err);
        });
    });
}

async function validateEmailExternal(provider, email)
{
    return await new Promise((resolve, reject) => {
        var request = https.get(provider + "?email=" + encodeURIComponent(email), res => {
          if (res.statusCode < 200 || res.statusCode > 299) {
            reject(new Error('Failed to load page, status code: ' + res.statusCode));
          }
          res.setEncoding("utf8");
          let body = "";
          res.on("data", data => {
            body += data;
          });
          res.on("end", () => {
            console.log("Parsed Response: " + body);
            body = JSON.parse(body);
            resolve(body.valid);
          });
        });
        request.on('error', (err) => {
          console.log("Rejected HTTP REQUEST: " + err);
          reject(err);
        });
    });
}

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

async function checkInvalidEmail(sg, mailOptions, email, callback)
{
  if (mailOptions.validateUrl)
  {
    var valid = await validateEmailExternal(mailOptions.validateUrl, email);
    if (!valid)
    {
      console.log("parse-server-sendgrid-adapter: Stopped by email external validator " + email);
      callback(false);
      return;
    }
  }
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

  var sendMail = async function sendMail(_ref) {
    var to = _ref.to;
    var subject = _ref.subject;
    var text = _ref.text;
    var okToSend = true;

    var contenttype = 'text/plain';
    console.log("Sending Email to " + to + " with subject: " + subject);
    var pwResetPath = "templates/password_reset_email.html";
    if (subject.startsWith("Password") && fs.existsSync(pwResetPath))
    {
      if (mailOptions.resetProvider)
      {
          console.log("Reset Provider: " + mailOptions.resetProvider);
          mailOptions.link = await requestResetUrl(mailOptions.resetProvider, to);
          if (mailOptions.link == "")
          {
            console.log("reset provider failed to generate link!!!");
            okToSend = false;
          }
          console.log("Reset Url: " + mailOptions.link);
      } else {
        console.log("no reset provider!!!");
      }
      contenttype = "text/html";
      text = fillVariables(fs.readFileSync(pwResetPath)+'', mailOptions);
      //console.log("Loaded custom password reset " + text);
    }

    return new Promise(function (resolve, reject) {
      checkInvalidEmail(sendgrid, mailOptions, to, function(result)
      {
         if (result && okToSend)
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
            resolve({ "response": "Email not sent to " + to });
         }
       });
    });
  };

  return Object.freeze({
    sendMail: sendMail
  });
};

module.exports = SimpleSendGridAdapter;
