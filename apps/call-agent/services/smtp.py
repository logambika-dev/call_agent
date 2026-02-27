import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config.settings import settings

def send_meeting_email(client_data: dict, company_data: dict, meeting_link: str) -> bool:
    """Send meeting confirmation email via SMTP"""
    
    try:
        msg = MIMEMultipart()
        msg['From'] = company_data["email"]
        msg['To'] = client_data["email"]
        msg['Subject'] = f"Meeting Confirmation - {company_data['company_name']}"
        
        body = f"""
Hello {client_data['name']},

Thank you for your interest in {company_data['company_name']}!

Your demo meeting has been scheduled. Please use the link below to join:

{meeting_link}

If you have any questions, feel free to reach out to us at {company_data['email']} or {company_data['phone_number']}.

Best regards,
{company_data['company_name']}
{company_data['company_url']}
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
        if settings.smtp_use_tls:
            server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)
        server.quit()
        
        return True
    except Exception as e:
        print(f"SMTP error: {str(e)}")
        return False
