import { Inject, Injectable } from '@nestjs/common';
import type { Skill, SkillDefinition } from './skill.types';

export const REGISTERED_SKILLS = Symbol('REGISTERED_SKILLS');

@Injectable()
export class SkillRegistry {
  private readonly skills: ReadonlyMap<string, Skill>;

  constructor(@Inject(REGISTERED_SKILLS) registered: Skill[]) {
    this.skills = new Map(registered.map((skill) => [skill.definition.name, skill]));

    if (this.skills.size !== registered.length) {
      throw new Error('Skill Registry 中存在重复的 Skill 名称');
    }
  }

  listDefinitions(): SkillDefinition[] {
    return [...this.skills.values()].map((skill) => skill.definition);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getTitle(name: string): string {
    return this.get(name)?.definition.title ?? name;
  }
}
