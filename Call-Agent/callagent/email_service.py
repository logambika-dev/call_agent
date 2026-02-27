"""Email Service - Send Meeting Confirmations"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from loguru import logger
from dotenv import load_dotenv

# Load environment variables from the BE root .env
env_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(env_path)

class EmailService:
    """Send meeting confirmation emails"""
    
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", 587))
        self.smtp_user = os.getenv("SMTP_USER")
        self.smtp_pass = os.getenv("SMTP_PASSWORD")
    
    def send_meeting_email(self, name: str, email: str, company: str, link: str, time: str) -> bool:
        """Send meeting confirmation"""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"Meeting Confirmed - Demo for {name}"
            msg['From'] = self.smtp_user
            msg['To'] = email
            
            html = f"""
            <html>
            <body style="font-family: Arial; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2>Great News, {name}!</h2>
                    <p>Thank you for your interest! We're excited to show you how No2Bounce can help {company}.</p>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3>Meeting Details</h3>
                        <p><strong>Time:</strong> {time}</p>
                        <p><strong>Duration:</strong> 30 minutes</p>
                        <p><strong>Link:</strong> <a href="{link}">{link}</a></p>
                    </div>
                    
                    <h4>What to Expect:</h4>
                    <ul>
                        <li>Live product demo</li>
                        <li>Discussion of your email challenges</li>
                        <li>Custom solution recommendations</li>
                        <li>Q&A session</li>
                    </ul>
                    
                    <p>Looking forward to speaking with you!</p>
                    <p style="color: #7f8c8d; margin-top: 30px;">
                        Best regards,<br><strong>AI SDR Team</strong><br>No2Bounce
                    </p>
                </div>
            </body>
            </html>
            """
            
            msg.attach(MIMEText(html, 'html'))
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_pass)
                server.send_message(msg)
            
            logger.info(f"Email sent to {email}")
            return True
            
        except Exception as e:
            logger.error(f"Email failed: {e}")
            return False
