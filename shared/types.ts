export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface User {
  id: number;
  username: string;
  email: string;
  home_dir: string;
  created_at: string;
}

export interface Domain {
  id: number;
  user_id: number;
  domain_name: string;
  document_root: string;
  is_ssl: boolean;
  php_version: string;
  created_at: string;
  username?: string; // Joined from users table
}

export interface Task {
  id: number;
  command: string;
  payload: any;
  status: TaskStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPort {
  id: number;
  user_id: number;
  port: number;
  service_name: string;
  domain_id: number;
  created_at: string;
}

export interface CronJob {
  id: number;
  user_id: number;
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
  command: string;
  description?: string;
  created_at: string;
}

export interface FtpAccount {
  id: number;
  user_id: number;
  ftp_username: string;
  homedir: string;
  created_at: string;
  owner_username?: string; // For admin view
}

export interface DnsZone {
  id: number;
  user_id: number | null;
  domain_name: string;
  ttl: number;
  created_at: string;
  username?: string; // For admin view
}

export interface DnsRecord {
  id: number;
  zone_id: number;
  name: string;
  type: string;
  content: string;
  priority: number | null;
  ttl: number | null;
  created_at: string;
}

export interface Database {
  id: number;
  user_id: number;
  db_name: string;
  db_user: string;
  created_at: string;
  owner_name?: string; // Joined from users table (admin view)
}

export interface MailUser {
  id: number;
  domain_id: number;
  email: string;
  quota: number;
  spam_filter_enabled: boolean;
  spam_digest_enabled: boolean;
  created_at: string;
  domain_name?: string;
}

export interface MailForwarder {
  id: number;
  domain_id: number;
  source: string;
  destination: string;
  created_at: string;
  domain_name?: string;
}

export interface MailAutoresponder {
  id: number;
  mail_user_id: number;
  message: string;
  enabled: boolean;
  created_at: string;
}

export interface MailQuarantine {
  id: number;
  mail_user_id: number;
  sender: string;
  subject: string;
  spam_score: number;
  file_path: string;
  created_at: string;
}

export interface MailAccessControl {
  id: number;
  mail_user_id: number;
  sender_pattern: string;
  access_type: 'allow' | 'block';
  created_at: string;
}
