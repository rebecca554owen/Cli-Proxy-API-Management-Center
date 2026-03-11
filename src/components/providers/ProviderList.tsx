import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

interface ProviderListProps<T> {
  items: T[];
  loading: boolean;
  keyField: (item: T, index: number) => string;
  renderContent: (item: T, index: number) => ReactNode;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  emptyTitle: string;
  emptyDescription: string;
  deleteLabel?: string;
  actionsDisabled?: boolean;
  getRowDisabled?: (item: T, index: number) => boolean;
  extraActionButtons?: (item: T, index: number) => ReactNode;
  renderExtraActions?: (item: T, index: number) => ReactNode;
  header?: ReactNode;
  listClassName?: string;
  rowClassName?: string;
  metaClassName?: string;
  actionsClassName?: string;
  actionButtonClassName?: string;
  actionSlotCount?: number;
}

export function ProviderList<T>({
  items,
  loading,
  keyField,
  renderContent,
  onEdit,
  onDelete,
  emptyTitle,
  emptyDescription,
  deleteLabel,
  actionsDisabled = false,
  getRowDisabled,
  extraActionButtons,
  renderExtraActions,
  header,
  listClassName,
  rowClassName,
  metaClassName,
  actionsClassName,
  actionButtonClassName,
  actionSlotCount = 4,
}: ProviderListProps<T>) {
  const { t } = useTranslation();

  if (loading && items.length === 0) {
    return <div className="hint">{t('common.loading')}</div>;
  }

  if (!items.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={listClassName || 'item-list'}>
      {header}
      {items.map((item, index) => {
        const rowDisabled = getRowDisabled ? getRowDisabled(item, index) : false;
        const actionNodes = [
          <Button
            key="edit"
            variant="secondary"
            size="sm"
            onClick={() => onEdit(index)}
            disabled={actionsDisabled}
            className={actionButtonClassName}
          >
            {t('common.edit')}
          </Button>,
          extraActionButtons ? extraActionButtons(item, index) : null,
          renderExtraActions ? renderExtraActions(item, index) : null,
          <Button
            key="delete"
            variant="danger"
            size="sm"
            onClick={() => onDelete(index)}
            disabled={actionsDisabled}
            className={actionButtonClassName}
          >
            {deleteLabel || t('common.delete')}
          </Button>,
        ].filter(Boolean) as ReactNode[];
        const placeholders = Math.max(actionSlotCount - actionNodes.length, 0);
        return (
          <div
            key={keyField(item, index)}
            className={rowClassName || 'item-row'}
            style={rowDisabled ? { opacity: 0.6 } : undefined}
          >
            <div className={metaClassName || 'item-meta'}>{renderContent(item, index)}</div>
            <div className={actionsClassName || 'item-actions'}>
              {actionNodes.map((node, actionIndex) => (
                <span key={actionIndex}>{node}</span>
              ))}
              {Array.from({ length: placeholders }, (_, placeholderIndex) => (
                <span
                  key={`placeholder-${placeholderIndex}`}
                  className={actionButtonClassName}
                  style={{ display: 'block', minHeight: 32, visibility: 'hidden' }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
