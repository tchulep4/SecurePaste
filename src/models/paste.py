from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Paste(db.Model):
    __tablename__ = 'pastes'
    
    id = db.Column(db.String(64), primary_key=True)
    encrypted_content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)
    self_destruct = db.Column(db.Boolean, default=False)
    viewed = db.Column(db.Boolean, default=False)
    
    def __init__(self, id, encrypted_content, expiration, self_destruct):
        self.id = id
        self.encrypted_content = encrypted_content
        self.self_destruct = self_destruct
        
        # Set expiration date based on the expiration parameter
        if expiration == 'never':
            self.expires_at = None
        else:
            # Parse the expiration string (e.g., "1h", "1d", "1w", "1m", "3m", "6m", "1y", "5y", or "custom")
            if expiration.startswith('custom_'):
                # Custom expiration format: custom_<value>_<unit>
                parts = expiration.split('_')
                if len(parts) == 3:
                    value = int(parts[1])
                    unit = parts[2]
                    self.set_expiration(value, unit)
            else:
                # Standard expiration formats
                if expiration.endswith('h'):
                    hours = int(expiration[:-1])
                    self.expires_at = datetime.utcnow() + timedelta(hours=hours)
                elif expiration.endswith('d'):
                    days = int(expiration[:-1])
                    self.expires_at = datetime.utcnow() + timedelta(days=days)
                elif expiration.endswith('w'):
                    weeks = int(expiration[:-1])
                    self.expires_at = datetime.utcnow() + timedelta(weeks=weeks)
                elif expiration.endswith('m'):
                    months = int(expiration[:-1])
                    # Approximate a month as 30 days
                    self.expires_at = datetime.utcnow() + timedelta(days=30 * months)
                elif expiration.endswith('y'):
                    years = int(expiration[:-1])
                    # Approximate a year as 365 days
                    self.expires_at = datetime.utcnow() + timedelta(days=365 * years)
    
    def set_expiration(self, value, unit):
        """Set expiration based on value and unit"""
        if unit == 'h':
            self.expires_at = datetime.utcnow() + timedelta(hours=value)
        elif unit == 'd':
            self.expires_at = datetime.utcnow() + timedelta(days=value)
        elif unit == 'w':
            self.expires_at = datetime.utcnow() + timedelta(weeks=value)
        elif unit == 'm':
            # Approximate a month as 30 days
            self.expires_at = datetime.utcnow() + timedelta(days=30 * value)
        elif unit == 'y':
            # Approximate a year as 365 days
            self.expires_at = datetime.utcnow() + timedelta(days=365 * value)
    
    def is_expired(self):
        """Check if the paste has expired"""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
    
    def should_delete(self):
        """Check if the paste should be deleted (expired or viewed with self-destruct)"""
        if self.is_expired():
            return True
        if self.self_destruct and self.viewed:
            return True
        return False
    
    def to_dict(self):
        """Convert paste to dictionary for API responses"""
        return {
            'id': self.id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'self_destruct': self.self_destruct,
            'viewed': self.viewed
        }
