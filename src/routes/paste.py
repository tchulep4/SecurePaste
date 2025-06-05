from flask import Blueprint, request, jsonify, abort
import uuid
import json
from src.models.paste import db, Paste

paste_bp = Blueprint('paste', __name__)

@paste_bp.route('/pastes', methods=['POST'])
def create_paste():
    """Create a new encrypted paste"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate required fields
    required_fields = ['encrypted_content', 'expiration']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Generate a unique ID for the paste
    paste_id = str(uuid.uuid4())[:12]
    
    # Create a new paste
    try:
        paste = Paste(
            id=paste_id,
            encrypted_content=data['encrypted_content'],
            expiration=data['expiration'],
            self_destruct=data.get('self_destruct', False)
        )
        
        db.session.add(paste)
        db.session.commit()
        
        return jsonify({
            'id': paste_id,
            'message': 'Paste created successfully'
        }), 201
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@paste_bp.route('/pastes/<paste_id>', methods=['GET'])
def get_paste(paste_id):
    """Retrieve an encrypted paste"""
    paste = Paste.query.get(paste_id)
    
    if not paste:
        return jsonify({'error': 'Paste not found'}), 404
    
    # Check if paste has expired
    if paste.is_expired():
        # Delete expired paste
        db.session.delete(paste)
        db.session.commit()
        return jsonify({'error': 'Paste has expired'}), 404
    
    # Prepare response
    response = {
        'id': paste.id,
        'encrypted_content': paste.encrypted_content,
        'self_destruct': paste.self_destruct
    }
    
    # Mark as viewed if it's a self-destruct paste
    if paste.self_destruct and not paste.viewed:
        paste.viewed = True
        db.session.commit()
        
        # If it's a self-destruct paste, schedule it for deletion
        # In a real implementation, this would be handled by a background task
        # For now, we'll just mark it for deletion on the next access
    
    return jsonify(response), 200

@paste_bp.route('/pastes/<paste_id>', methods=['DELETE'])
def delete_paste(paste_id):
    """Delete a paste (admin functionality)"""
    paste = Paste.query.get(paste_id)
    
    if not paste:
        return jsonify({'error': 'Paste not found'}), 404
    
    try:
        db.session.delete(paste)
        db.session.commit()
        return jsonify({'message': 'Paste deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@paste_bp.route('/admin/pastes', methods=['GET'])
def admin_list_pastes():
    """List all pastes (admin functionality)"""
    # In a real implementation, this would require authentication
    # and authorization checks for admin access
    
    # Get query parameters for pagination
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Query pastes with pagination
    pastes = Paste.query.paginate(page=page, per_page=per_page)
    
    # Format response
    response = {
        'pastes': [paste.to_dict() for paste in pastes.items],
        'total': pastes.total,
        'pages': pastes.pages,
        'current_page': pastes.page
    }
    
    return jsonify(response), 200

@paste_bp.route('/admin/cleanup', methods=['POST'])
def admin_cleanup_expired():
    """Clean up expired pastes (admin functionality)"""
    # In a real implementation, this would require authentication
    # and would typically be run as a scheduled task
    
    try:
        # Find all expired pastes
        expired_pastes = Paste.query.filter(
            (Paste.expires_at < db.func.now()) | 
            (Paste.self_destruct == True, Paste.viewed == True)
        ).all()
        
        # Delete expired pastes
        count = 0
        for paste in expired_pastes:
            db.session.delete(paste)
            count += 1
        
        db.session.commit()
        
        return jsonify({
            'message': f'Cleanup completed successfully',
            'deleted_count': count
        }), 200
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
