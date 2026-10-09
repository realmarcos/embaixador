
type ThemePreference = "LIGHT" | "DARK";
type RetentionHours = 1 | 8 | 24 | 72 | 168 | 336 | 720;

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatar: string;
  themePreference: ThemePreference;
  retentionHours: RetentionHours;
  createdAt: Date;
  updatedAt: Date;
}

type PublicUser = Omit<User, "passwordHash">;

interface UserCreateInput {
  name: string;
  email: string;
  avatar: string;
  password: string;
  themePreference?: ThemePreference;
  retentionHours?: RetentionHours;
}

interface UserRecordCreateInput {
  name: string;
  email: string;
  avatar: string;
  passwordHash: string;
  themePreference: ThemePreference;
  retentionHours: RetentionHours;
}

interface UserUpdateInput {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
  password?: string;
  themePreference?: ThemePreference;
  retentionHours?: RetentionHours;
}

export {
  PublicUser,
  RetentionHours,
  ThemePreference,
  User,
  UserCreateInput,
  UserRecordCreateInput,
  UserUpdateInput,
};