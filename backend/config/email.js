/**
 * Email Service Utility
 * Handles sending emails using nodemailer with SMTP (Gmail/MailerSend)
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter object using SMTP
const createTransporter = () => {
  // Check if email configuration exists
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || 
      process.env.EMAIL_USER === 'your-email@gmail.com' ||
      process.env.EMAIL_PASS === 'your-app-password') {
    console.log('⚠️  Email not configured. Set EMAIL_USER and EMAIL_PASS in .env');
    return null;
  }

  const port = parseInt(process.env.EMAIL_PORT) || 587;
  // MailerSend uses secure=true for port 2525/465, STARTTLS for port 587
  const isSecurePort = port === 2525 || port === 465;
  
  console.log('📧 Email configured:', { host: process.env.EMAIL_HOST, port, user: process.env.EMAIL_USER });

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: isSecurePort,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - Email body in HTML format
 * @returns {Promise<boolean>} - True if email sent successfully
 */
const sendEmail = async (to, subject, html) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.log('📧 Email skipped - not configured');
    return false;
  }

  try {
    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    console.log('📧 Sending email via MailerSend:', { from: fromAddress, to, subject });
    const info = await transporter.sendMail({
      from: fromAddress,
      to: to,
      subject: subject,
      html: html
    });

    console.log('📧 Email sent successfully:', info.messageId);
    console.log('📧 MailerSend response:', JSON.stringify(info, null, 2));
    return true;
  } catch (error) {
    console.error('📧 Error sending email:', error);
    if (error.response) {
      console.error('📧 MailerSend error response:', JSON.stringify(error.response, null, 2));
    }
    return false;
  }
};

/**
 * Send appointment notification to doctor
 * @param {Object} doctor - Doctor information
 * @param {string} doctor.email - Doctor's email
 * @param {string} doctor.name - Doctor's name
 * @param {Object} patient - Patient information
 * @param {string} patient.name - Patient's name
 * @param {string} patient.email - Patient's email
 * @param {string} appointmentDate - Appointment date
 * @param {string} appointmentTime - Appointment time
 * @param {string} reason - Reason for appointment
 * @returns {Promise<boolean>}
 */
const sendAppointmentNotificationToDoctor = async (doctor, patient, appointmentDate, appointmentTime, reason) => {
  const subject = '🔔 New Appointment Booked - Prediacare Clinic';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .detail { margin: 10px 0; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }
        .highlight { background-color: #e8f5e9; padding: 10px; border-left: 4px solid #4CAF50; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>New Appointment Notification</h2>
        </div>
        <div class="content">
          <p>Dear <strong>Dr. ${doctor.name}</strong>,</p>
          
          <p>A new appointment has been booked with you. Here are the details:</p>
          
          <div class="highlight">
            <div class="detail">
              <span class="label">Patient Name:</span>
              <span class="value">${patient.name}</span>
            </div>
            <div class="detail">
              <span class="label">Patient Email:</span>
              <span class="value">${patient.email}</span>
            </div>
            <div class="detail">
              <span class="label">Appointment Date:</span>
              <span class="value">${appointmentDate}</span>
            </div>
            <div class="detail">
              <span class="label">Appointment Time:</span>
              <span class="value">${appointmentTime}</span>
            </div>
            <div class="detail">
              <span class="label">Reason for Visit:</span>
              <span class="value">${reason || 'Not specified'}</span>
            </div>
          </div>
          
          <p>Please log in to your doctor dashboard to view and manage this appointment.</p>
          
          <p><strong>Note:</strong> If you need to reschedule or have any concerns, please contact the patient or the clinic administration.</p>
        </div>
        <div class="footer">
          <p>This is an automated notification from PrediaCare Clinic Management System.</p>
          <p>© 2026 PrediaCare Clinic. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(doctor.email, subject, html);
};

/**
 * Send test result notification to patient
 * @param {Object} patient - Patient information
 * @param {string} patient.email - Patient's email
 * @param {string} patient.name - Patient's name  
 * @param {string} testName - Name of the test
 * @param {string} resultData - Test result data
 * @param {string} notes - Additional notes
 * @returns {Promise<boolean>}
 */
const sendTestResultNotificationToPatient = async (patient, testName, resultData, notes) => {
  const subject = `🧪 Test Results Available - ${testName} - PrediaCare Clinic`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .detail { margin: 10px 0; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; }
        .footer { background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }
        .result-box { background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #e2e8f0; margin: 15px 0; }
        .result-item { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .result-item:last-child { border-bottom: none; }
        .result-name { font-weight: 600; color: #0f172a; }
        .result-value { color: #16a34a; }
        .cta-button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>🧪 Your Test Results Are Ready</h2>
        </div>
        <div class="content">
          <p>Dear <strong>${patient.name || 'Patient'}</strong>,</p>
          
          <p>We are pleased to inform you that your test results are now available. Please find the details below:</p>
          
          <div class="result-box">
            <div class="detail">
              <span class="label">Test Name:</span>
              <span class="value">${testName}</span>
            </div>
            <div class="detail">
              <span class="label">Date Completed:</span>
              <span class="value">${new Date().toLocaleDateString()}</span>
            </div>
          </div>
          
          <div class="result-box">
            <div class="detail">
              <span class="label">Test Results:</span>
            </div>
            <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; background: #f8fafc; padding: 10px; border-radius: 5px; margin-top: 10px;">${resultData}</pre>
          </div>
          
          ${notes ? `
          <div class="result-box">
            <div class="detail">
              <span class="label">Additional Notes:</span>
            </div>
            <p>${notes}</p>
          </div>
          ` : ''}
          
          <p>Please log in to your patient dashboard to view the complete results and download any attached files.</p>
          
          <p style="text-align: center;">
            <a href="#" class="cta-button">View Results</a>
          </p>
          
          <p><strong>Important:</strong> Please consult with your doctor to discuss these results. If you have any questions, please don't hesitate to contact us.</p>
        </div>
        <div class="footer">
          <p>This is an automated notification from PrediaCare Clinic.</p>
          <p>© 2026 PrediaCare Clinic. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(patient.email, subject, html);
};

module.exports = {
  sendEmail,
  sendAppointmentNotificationToDoctor,
  sendTestResultNotificationToPatient
};
