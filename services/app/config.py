import os
class Config:
    # The Secret_key handles CRSS/XSS attacks 
    SECRET_KEY = os.environ.get('SECRET_KEY')
    MAIL_SERVER = 'smtp.googlemail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', 'tolulomofateye@gmail.com')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', 'mmysgzrqvcwvnwqr')
    MONGO_USER = os.environ.get('MM_MONGO_USER', '')
    MONGO_PASSWORD = os.environ.get('MM_MONGO_PWD', '')
    MONGO_DATABASE = os.environ.get('MANAGED_SERVICES_DB', '')
    MONGO_URI = os.environ.get('MONGO_ADDRESS', '')
    MONGO_PORT = os.environ.get('MONGO_PORT', '')
    MGS_USER = os.environ.get('MANAGED_SERVICES_USER', '')
    MGS_PWD = os.environ.get('MANAGED_SERVICES_PWD', '')