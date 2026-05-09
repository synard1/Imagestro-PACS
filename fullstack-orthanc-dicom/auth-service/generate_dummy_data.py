#!/usr/bin/env python3
"""
Dummy Data Generator for Auth Service
=====================================

Script untuk generate dummy data users, roles, dan permissions
untuk testing dan development environment.

Usage:
    python generate_dummy_data.py

Features:
- Generate sample users dengan berbagai roles
- Setup complete role-permission mappings
- Generate realistic user data
- Support untuk multiple roles per user
- Logging untuk tracking proses

Author: AI Assistant
Date: 2024
"""

import os
import sys
import uuid
import random
import logging
from datetime import datetime, timedelta
from faker import Faker
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
import bcrypt

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', 5532)),
    'connect_timeout': 10,
    'application_name': 'dummy_data_generator'
}

# Initialize Faker for realistic data
fake = Faker(['id_ID', 'en_US'])  # Indonesian and English locales

@contextmanager
def get_db_connection():
    """Database connection context manager"""
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        yield conn
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

def hash_password(password):
    """Hash password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def get_role_id(cursor, role_name):
    """Get role ID by name"""
    cursor.execute("SELECT id FROM roles WHERE name = %s", (role_name,))
    result = cursor.fetchone()
    return result[0] if result else None

def get_permission_id(cursor, permission_name):
    """Get permission ID by name"""
    cursor.execute("SELECT id FROM permissions WHERE name = %s", (permission_name,))
    result = cursor.fetchone()
    return result[0] if result else None

def create_dummy_users():
    """Generate dummy users with various roles"""
    
    # Template users dengan role spesifik
    user_templates = [
        # Administrators
        {
            'username': 'admin',
            'email': 'admin@hospital.com',
            'password': 'admin123',
            'full_name': 'System Administrator',
            'role': 'ADMIN',
            'is_verified': True
        },
        {
            'username': 'superadmin',
            'email': 'superadmin@hospital.com',
            'password': 'super123',
            'full_name': 'Super Administrator',
            'role': 'ADMIN',
            'is_verified': True
        },
        
        # Doctors
        {
            'username': 'dr.smith',
            'email': 'dr.smith@hospital.com',
            'password': 'doctor123',
            'full_name': 'Dr. John Smith',
            'role': 'DOCTOR',
            'is_verified': True
        },
        {
            'username': 'dr.sarah',
            'email': 'dr.sarah@hospital.com',
            'password': 'doctor123',
            'full_name': 'Dr. Sarah Johnson',
            'role': 'DOCTOR',
            'is_verified': True
        },
        {
            'username': 'dr.ahmad',
            'email': 'dr.ahmad@hospital.com',
            'password': 'doctor123',
            'full_name': 'Dr. Ahmad Wijaya',
            'role': 'DOCTOR',
            'is_verified': True
        },
        
        # Technicians
        {
            'username': 'tech.mike',
            'email': 'mike.tech@hospital.com',
            'password': 'tech123',
            'full_name': 'Mike Rodriguez',
            'role': 'TECHNICIAN',
            'is_verified': True
        },
        {
            'username': 'tech.lisa',
            'email': 'lisa.tech@hospital.com',
            'password': 'tech123',
            'full_name': 'Lisa Chen',
            'role': 'TECHNICIAN',
            'is_verified': True
        },
        {
            'username': 'tech.budi',
            'email': 'budi.tech@hospital.com',
            'password': 'tech123',
            'full_name': 'Budi Santoso',
            'role': 'TECHNICIAN',
            'is_verified': True
        },
        
        # Receptionists
        {
            'username': 'reception.anna',
            'email': 'anna.reception@hospital.com',
            'password': 'reception123',
            'full_name': 'Anna Williams',
            'role': 'RECEPTIONIST',
            'is_verified': True
        },
        {
            'username': 'reception.siti',
            'email': 'siti.reception@hospital.com',
            'password': 'reception123',
            'full_name': 'Siti Nurhaliza',
            'role': 'RECEPTIONIST',
            'is_verified': True
        },
        
        # Viewers
        {
            'username': 'viewer.guest',
            'email': 'guest@hospital.com',
            'password': 'viewer123',
            'full_name': 'Guest User',
            'role': 'VIEWER',
            'is_verified': False
        },
        {
            'username': 'intern.john',
            'email': 'john.intern@hospital.com',
            'password': 'intern123',
            'full_name': 'John Intern',
            'role': 'VIEWER',
            'is_verified': True
        }
    ]
    
    # Generate additional random users
    roles = ['DOCTOR', 'TECHNICIAN', 'RECEPTIONIST', 'VIEWER']
    departments = ['Radiology', 'Cardiology', 'Neurology', 'Orthopedic', 'Emergency', 'ICU']
    
    for i in range(20):  # Generate 20 additional users
        role = random.choice(roles)
        department = random.choice(departments)
        
        first_name = fake.first_name()
        last_name = fake.last_name()
        username = f"{first_name.lower()}.{last_name.lower()}{i+1}"
        
        user_templates.append({
            'username': username,
            'email': f"{username}@hospital.com",
            'password': f"{role.lower()}123",
            'full_name': f"{first_name} {last_name}",
            'role': role,
            'is_verified': random.choice([True, True, True, False]),  # 75% verified
            'department': department
        })
    
    return user_templates

def insert_users(cursor, users_data):
    """Insert users into database"""
    logger.info(f"Inserting {len(users_data)} users...")
    
    inserted_users = []
    
    for user_data in users_data:
        try:
            # Hash password
            password_hash = hash_password(user_data['password'])
            
            # Get role_id
            role_id = get_role_id(cursor, user_data['role'])
            
            # Insert user
            cursor.execute("""
                INSERT INTO users (
                    username, email, password_hash, full_name, 
                    role, role_id, is_active, is_verified,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (username) DO NOTHING
                RETURNING id, username, email, full_name, role
            """, (
                user_data['username'],
                user_data['email'],
                password_hash,
                user_data['full_name'],
                user_data['role'],
                role_id,
                True,  # is_active
                user_data['is_verified'],
                datetime.now(),
                datetime.now()
            ))
            
            result = cursor.fetchone()
            if result:
                inserted_users.append({
                    'id': result[0],
                    'username': result[1],
                    'email': result[2],
                    'full_name': result[3],
                    'role': result[4],
                    'password': user_data['password']  # Store for logging
                })
                logger.info(f"✓ Created user: {result[1]} ({result[4]})")
            else:
                logger.warning(f"User {user_data['username']} already exists, skipped")
                
        except Exception as e:
            logger.error(f"Failed to create user {user_data['username']}: {str(e)}")
    
    return inserted_users

def assign_additional_roles(cursor, users):
    """Assign additional roles to some users for testing multi-role functionality"""
    logger.info("Assigning additional roles to users...")
    
    # Some users can have multiple roles
    multi_role_assignments = [
        ('admin', ['ADMIN', 'DOCTOR']),  # Admin yang juga doctor
        ('dr.smith', ['DOCTOR', 'TECHNICIAN']),  # Doctor yang bisa operate equipment
        ('tech.mike', ['TECHNICIAN', 'VIEWER']),  # Technician dengan viewer access
    ]
    
    for username, roles in multi_role_assignments:
        # Find user
        user = next((u for u in users if u['username'] == username), None)
        if not user:
            continue
            
        for role_name in roles:
            role_id = get_role_id(cursor, role_name)
            if role_id:
                try:
                    cursor.execute("""
                        INSERT INTO user_roles (user_id, role_id)
                        VALUES (%s, %s)
                        ON CONFLICT (user_id, role_id) DO NOTHING
                    """, (user['id'], role_id))
                    logger.info(f"✓ Assigned role {role_name} to {username}")
                except Exception as e:
                    logger.error(f"Failed to assign role {role_name} to {username}: {str(e)}")

def assign_direct_permissions(cursor, users):
    """Assign direct permissions to some users for testing"""
    logger.info("Assigning direct permissions to users...")
    
    # Some users get direct permissions (not through roles)
    direct_permissions = [
        ('intern.john', ['patient:read', 'worklist:read']),  # Intern gets limited access
        ('viewer.guest', ['dicom:read']),  # Guest gets only DICOM read
    ]
    
    for username, permissions in direct_permissions:
        user = next((u for u in users if u['username'] == username), None)
        if not user:
            continue
            
        for perm_name in permissions:
            perm_id = get_permission_id(cursor, perm_name)
            if perm_id:
                try:
                    cursor.execute("""
                        INSERT INTO user_permissions (user_id, permission_id)
                        VALUES (%s, %s)
                        ON CONFLICT (user_id, permission_id) DO NOTHING
                    """, (user['id'], perm_id))
                    logger.info(f"✓ Assigned permission {perm_name} to {username}")
                except Exception as e:
                    logger.error(f"Failed to assign permission {perm_name} to {username}: {str(e)}")

def generate_user_activity(cursor, users):
    """Generate some user activity data (last_login, failed_attempts)"""
    logger.info("Generating user activity data...")
    
    for user in users:
        # Random last login (within last 30 days)
        if random.choice([True, False, True]):  # 66% chance of recent login
            last_login = fake.date_time_between(start_date='-30d', end_date='now')
            
            # Random failed attempts (mostly 0, some with 1-2)
            failed_attempts = random.choices([0, 1, 2, 3], weights=[70, 20, 8, 2])[0]
            
            try:
                cursor.execute("""
                    UPDATE users 
                    SET last_login = %s, failed_login_attempts = %s
                    WHERE id = %s
                """, (last_login, failed_attempts, user['id']))
            except Exception as e:
                logger.error(f"Failed to update activity for {user['username']}: {str(e)}")

def print_summary(users):
    """Print summary of created users"""
    logger.info("\n" + "="*60)
    logger.info("DUMMY DATA GENERATION SUMMARY")
    logger.info("="*60)
    
    # Group by role
    role_counts = {}
    for user in users:
        role = user['role']
        if role not in role_counts:
            role_counts[role] = []
        role_counts[role].append(user)
    
    logger.info(f"Total Users Created: {len(users)}")
    logger.info("\nUsers by Role:")
    
    for role, role_users in role_counts.items():
        logger.info(f"\n{role} ({len(role_users)} users):")
        for user in role_users:
            logger.info(f"  - {user['username']} | {user['email']} | Password: {user['password']}")
    
    logger.info("\n" + "="*60)
    logger.info("QUICK LOGIN CREDENTIALS")
    logger.info("="*60)
    
    # Show key users for testing
    key_users = [
        ('admin', 'admin123', 'Full system access'),
        ('dr.smith', 'doctor123', 'Doctor with medical access'),
        ('tech.mike', 'tech123', 'Technician with equipment access'),
        ('reception.anna', 'reception123', 'Reception with patient management'),
        ('viewer.guest', 'viewer123', 'Read-only access')
    ]
    
    for username, password, description in key_users:
        logger.info(f"{username:15} | {password:12} | {description}")
    
    logger.info("\n" + "="*60)

def main():
    """Main function to generate all dummy data"""
    logger.info("Starting dummy data generation...")
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Generate user data
            users_data = create_dummy_users()
            
            # Insert users
            inserted_users = insert_users(cursor, users_data)
            
            if not inserted_users:
                logger.warning("No users were inserted. Database might already contain the data.")
                return
            
            # Assign additional roles
            assign_additional_roles(cursor, inserted_users)
            
            # Assign direct permissions
            assign_direct_permissions(cursor, inserted_users)
            
            # Generate activity data
            generate_user_activity(cursor, inserted_users)
            
            # Commit all changes
            conn.commit()
            
            # Print summary
            print_summary(inserted_users)
            
            logger.info("✅ Dummy data generation completed successfully!")
            
    except Exception as e:
        logger.error(f"❌ Failed to generate dummy data: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()