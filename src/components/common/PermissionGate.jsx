import { canAny, can } from '../../services/rbac'

export default function PermissionGate({ children, perm, any }) {
  if (perm && !can(perm)) return null
  if (any && !canAny(any)) return null
  return children
}
