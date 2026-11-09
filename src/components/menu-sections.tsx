import type { MenuGroup } from '@/components/menu-actions';
import { Row, Section } from '@/components/settings';

export function MenuSections({ groups, titles }: { groups: MenuGroup[]; titles: Partial<Record<MenuGroup['key'], string>> }) {
  return groups.map((group) => (
    <Section key={group.key} title={titles[group.key] ?? ''}>
      {group.items.map((item) => (
        <Row key={item.key} title={item.title} detail={item.detail} onPress={item.onPress} />
      ))}
    </Section>
  ));
}
