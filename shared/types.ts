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
