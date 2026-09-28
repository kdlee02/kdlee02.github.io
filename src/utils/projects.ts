import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'project'>;

/** Published projects, highest `order` first. Drafts are dropped, matching fetchPosts. */
export const fetchProjects = async (): Promise<Project[]> => {
  const projects = await getCollection('project', ({ data }) => !data.draft);

  return projects.sort(
    (a, b) =>
      (b.data.order ?? 0) - (a.data.order ?? 0) ||
      (b.data.publishDate?.valueOf() ?? 0) - (a.data.publishDate?.valueOf() ?? 0)
  );
};
