import { getUserAvatarUrl, getUserInitials } from '../lib/users.js';

export default function UserAvatar({
  user,
  title,
  className = '',
  imageClassName = '',
  initialsClassName = '',
}) {
  const avatarUrl = getUserAvatarUrl(user);
  const initials = getUserInitials(user);

  return (
    <span title={title} className={className}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={initials}
          className={imageClassName || 'h-full w-full object-cover'}
          loading="lazy"
        />
      ) : (
        <span className={initialsClassName}>{initials}</span>
      )}
    </span>
  );
}
