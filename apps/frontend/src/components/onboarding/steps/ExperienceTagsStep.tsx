'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, CheckCircle, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ExperienceTag, TagsStepData, OnboardingStepData } from '@/lib/onboarding-types';

interface ExperienceTagsStepProps {
  stepData: TagsStepData | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
  defaultTags: ExperienceTag[];
}

interface TagItemProps {
  tag: ExperienceTag;
  index: number;
  onRemove: (id: string) => void;
  onEmojiChange: (id: string, emoji: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

const TagItem = ({
  tag,
  index,
  onRemove,
  onEmojiChange,
  onLabelChange,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: TagItemProps) => (
  <div className="flex items-center gap-3 p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg border border-secondary-200 dark:border-secondary-700">
    <div className="flex flex-col items-center gap-1">
      {canMoveUp && (
        <Button variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={() => onMoveUp(tag.id)} aria-label="Move up">
          <ChevronUp className="h-3 w-3" />
        </Button>
      )}
      <GripVertical className="h-5 w-5 text-secondary-400 cursor-grab" />
      {canMoveDown && (
        <Button variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={() => onMoveDown(tag.id)} aria-label="Move down">
          <ChevronDown className="h-3 w-3" />
        </Button>
      )}
    </div>
    <div className="relative w-10">
      <Input
        value={tag.emoji}
        onChange={e => onEmojiChange(tag.id, e.target.value.slice(0, 2))}
        placeholder="😊"
        className="text-center text-xl"
        maxLength={2}
      />
    </div>
    <Input
      value={tag.label}
      onChange={e => onLabelChange(tag.id, e.target.value)}
      placeholder="Tag label"
      className="flex-1"
      maxLength={30}
    />
    <span className="text-secondary-400 text-sm font-medium">#{index + 1}</span>
    <Button
      variant="ghost"
      size="icon"
      onClick={() => onRemove(tag.id)}
      className="text-error-500 hover:text-error-600"
      aria-label="Remove tag"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
);

export function ExperienceTagsStep({ stepData, onDataChange, isSaving, defaultTags }: ExperienceTagsStepProps) {
  const [tags, setTags] = useState<ExperienceTag[]>(stepData?.tags || defaultTags);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagEmoji, setNewTagEmoji] = useState('✨');
  const [errors, setErrors] = useState<string | null>(null);

  useEffect(() => {
    if (stepData?.tags) {
      setTags(stepData.tags);
    }
  }, [stepData]);

  const validateTags = () => {
    if (tags.length < 6) {
      return `Minimum 6 tags required (currently ${tags.length})`;
    }
    if (tags.length > 10) {
      return `Maximum 10 tags allowed (currently ${tags.length})`;
    }
    const duplicateLabels = tags.filter((tag, index) => tags.findIndex(t => t.label.toLowerCase() === tag.label.toLowerCase()) !== index);
    if (duplicateLabels.length > 0) {
      return 'Tag labels must be unique';
    }
    const emptyLabels = tags.filter(tag => !tag.label.trim());
    if (emptyLabels.length > 0) {
      return 'All tags must have a label';
    }
    return null;
  };

  const updateTags = (newTags: ExperienceTag[]) => {
    const error = validateTagsWithArray(newTags);
    setErrors(error);
    setTags(newTags);
    onDataChange('tags', { tags: newTags });
  };

  const validateTagsWithArray = (tagArray: ExperienceTag[]) => {
    if (tagArray.length < 6) {
      return `Minimum 6 tags required (currently ${tagArray.length})`;
    }
    if (tagArray.length > 10) {
      return `Maximum 10 tags allowed (currently ${tagArray.length})`;
    }
    const duplicateLabels = tagArray.filter((tag, index) => tagArray.findIndex(t => t.label.toLowerCase() === tag.label.toLowerCase()) !== index);
    if (duplicateLabels.length > 0) {
      return 'Tag labels must be unique';
    }
    const emptyLabels = tagArray.filter(tag => !tag.label.trim());
    if (emptyLabels.length > 0) {
      return 'All tags must have a label';
    }
    return null;
  };

  const addTag = () => {
    if (!newTagLabel.trim() || !newTagEmoji.trim()) return;
    if (tags.length >= 10) return;

    const newTag: ExperienceTag = {
      id: `tag-${Date.now()}`,
      label: newTagLabel.trim(),
      emoji: newTagEmoji.trim().slice(0, 2),
      order: tags.length,
    };

    updateTags([...tags, newTag]);
    setNewTagLabel('');
    setNewTagEmoji('✨');
  };

  const removeTag = (id: string) => {
    if (tags.length <= 6) return;
    updateTags(tags.filter(t => t.id !== id).map((t, i) => ({ ...t, order: i })));
  };

  const handleEmojiChange = (id: string, emoji: string) => {
    updateTags(tags.map(t => t.id === id ? { ...t, emoji } : t));
  };

  const handleLabelChange = (id: string, label: string) => {
    updateTags(tags.map(t => t.id === id ? { ...t, label } : t));
  };

  const moveUp = (id: string) => {
    const index = tags.findIndex(t => t.id === id);
    if (index <= 0) return;
    const newTags = [...tags];
    const [moved] = newTags.splice(index, 1);
    newTags.splice(index - 1, 0, moved);
    updateTags(newTags.map((t, i) => ({ ...t, order: i })));
  };

  const moveDown = (id: string) => {
    const index = tags.findIndex(t => t.id === id);
    if (index >= tags.length - 1) return;
    const newTags = [...tags];
    const [moved] = newTags.splice(index, 1);
    newTags.splice(index + 1, 0, moved);
    updateTags(newTags.map((t, i) => ({ ...t, order: i })));
  };

  const isValid = tags.length >= 6 && tags.length <= 10 && !errors;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-secondary-900 dark:text-white">
            Experience Tags ({tags.length}/10)
          </h3>
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            Add 6-10 tags that customers can use to rate their experience
          </p>
        </div>
        <Badge
          variant={tags.length >= 6 && tags.length <= 10 ? 'success' : 'secondary'}
          className="text-sm"
        >
          {tags.length >= 6 && tags.length <= 10 ? 'Valid' : tags.length < 6 ? `${6 - tags.length} more needed` : 'Max reached'}
        </Badge>
      </div>

      {/* Add new tag */}
      <Card className="border-dashed border-secondary-300 dark:border-secondary-600">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative w-10">
              <Input
                value={newTagEmoji}
                onChange={e => setNewTagEmoji(e.target.value.slice(0, 2))}
                placeholder="😊"
                className="text-center text-xl"
                maxLength={2}
                disabled={tags.length >= 10}
              />
            </div>
            <Input
              value={newTagLabel}
              onChange={e => setNewTagLabel(e.target.value)}
              placeholder="Tag label (e.g., Food Quality)"
              className="flex-1"
              maxLength={30}
              disabled={tags.length >= 10}
              onKeyDown={e => e.key === 'Enter' && addTag()}
            />
            <Button
              onClick={addTag}
              disabled={tags.length >= 10 || !newTagLabel.trim() || !newTagEmoji.trim() || isSaving}
              className="h-10"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tags list */}
      <div className="space-y-2">
        <p className="text-xs text-secondary-500">Use arrows to reorder tags</p>
        {tags.map((tag, index) => (
          <TagItem
            key={tag.id}
            tag={tag}
            index={index}
            onRemove={removeTag}
            onEmojiChange={handleEmojiChange}
            onLabelChange={handleLabelChange}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            canMoveUp={index > 0}
            canMoveDown={index < tags.length - 1}
          />
        ))}
      </div>

      {errors && (
        <div className="p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg flex items-center gap-2 text-error-700 dark:text-error-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{errors}</span>
        </div>
      )}

      {isValid && (
        <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
          <span className="text-success-700 dark:text-success-300">
            Perfect! You have {tags.length} tags configured.
          </span>
        </div>
      )}

      {/* Default tags hint */}
      {tags.length === 0 && (
        <Card className="border-secondary-200 dark:border-secondary-700">
          <CardContent className="p-4">
            <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-3">
              Quick start with default tags:
            </p>
            <div className="flex flex-wrap gap-2">
              {defaultTags.map(tag => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20"
                  onClick={() => {
                    const newTag: ExperienceTag = {
                      id: `tag-${Date.now()}-${tag.id}`,
                      label: tag.label,
                      emoji: tag.emoji,
                      order: tags.length,
                    };
                    updateTags([...tags, newTag]);
                  }}
                >
                  {tag.emoji} {tag.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}