import { DomainLocale, I18NConfig } from '../../config-shared'
import { Normalizer } from './normalizer'

/**
 * The result of matching a locale aware route.
 */
interface LocaleMatch {
  /**
   * The pathname without the locale prefix (if any).
   */
  pathname: string

  /**
   * The detected locale. If no locale was detected, this will be `undefined`.
   */
  detectedLocale?: string
}

type LocaleMatchOptions =
  | {
      /**
       * When provided, it will be used as the default locale if the locale
       * cannot be inferred from the pathname.
       */
      hostname: string

      /**
       * When provided, it will be used as the default locale if the locale cannot
       * be inferred from the hostname.
       */
      defaultLocale?: string
    }
  | {
      /**
       * When provided, it will be used as the default locale if the locale
       * cannot be inferred from the pathname.
       */
      defaultLocale: string | undefined
    }

/**
 * The LocaleRouteNormalizer is used to match locale aware routes, detect the
 * locale from the pathname and hostname and normalize the pathname by removing
 * the locale prefix.
 */
export class LocaleRouteNormalizer implements Normalizer {
  private readonly lowerCaseLocales: ReadonlyArray<string>
  private readonly lowerCaseDomains?: ReadonlyArray<
    DomainLocale & { hostname: string }
  >

  constructor(public readonly config: I18NConfig) {
    this.lowerCaseLocales = config.locales.map((locale) => locale.toLowerCase())
    this.lowerCaseDomains = config.domains?.map((domainLocale) => {
      const domain = domainLocale.domain.toLowerCase()
      return {
        defaultLocale: domainLocale.defaultLocale.toLowerCase(),
        hostname: domain.split(':')[0],
        domain,
        locales: domainLocale.locales?.map((locale) => locale.toLowerCase()),
        http: domainLocale.http,
      }
    })
  }

  /**
   * Detects the domain locale from the hostname and the detected locale if
   * provided.
   *
   * @param hostname The hostname to detect the domain locale from, this must be lowercased.
   * @param detectedLocale The detected locale to use if the hostname does not match.
   * @returns The domain locale if found, `undefined` otherwise.
   */
  public detectDomainLocale(
    hostname?: string,
    detectedLocale?: string
  ): DomainLocale | undefined {
    if (!hostname || !this.lowerCaseDomains || !this.config.domains) return

    if (detectedLocale) detectedLocale = detectedLocale.toLowerCase()

    for (let i = 0; i < this.lowerCaseDomains.length; i++) {
      const domainLocale = this.lowerCaseDomains[i]
      if (
        // We assume that the hostname is already lowercased.
        domainLocale.defaultLocale === hostname ||
        // Configuration validation ensures that the locale is not repeated in
        // other domains locales.
        domainLocale.locales?.some((locale) => locale === detectedLocale)
      ) {
        return this.config.domains[i]
      }
    }

    return
  }

  /**
   * Infers the default locale from the hostname (if provided).
   *
   * @param hostname The hostname to infer the default locale from.
   * @returns The default locale for the hostname, else the default locale from
   *          the configuration.
   */
  private inferDefaultLocale(hostname?: string): string {
    if (!hostname) return this.config.defaultLocale

    const domainLocale = this.detectDomainLocale(hostname)
    if (!domainLocale) return this.config.defaultLocale

    return domainLocale.defaultLocale
  }

  /**
   * Matches the pathname to a locale and returns the pathname without the
   * locale. This can be used during the matching phase to match the request to
   * locale aware routes.
   *
   * @param pathname The pathname that could contain a locale prefix.
   * @param options The options to use when matching the locale.
   * @returns The matched locale and the pathname without the locale prefix
   *          (if any).
   */
  public match(pathname: string, options: LocaleMatchOptions): LocaleMatch {
    let detectedLocale: string | undefined =
      'hostname' in options
        ? this.inferDefaultLocale(options.hostname)
        : options.defaultLocale

    if (this.config.locales.length === 0) return { detectedLocale, pathname }

    // The first segment will be empty, because it has a leading `/`. If
    // there is no further segment, there is no locale.
    const segments = pathname.split('/')
    if (!segments[1]) return { detectedLocale, pathname }

    // The second segment will contain the locale part if any.
    const segment = segments[1].toLowerCase()

    // See if the segment matches one of the locales.
    const index = this.lowerCaseLocales.indexOf(segment)
    if (index < 0) return { detectedLocale, pathname }

    // Return the case-sensitive locale.
    detectedLocale = this.config.locales[index]

    // Remove the `/${locale}` part of the pathname.
    pathname = pathname.slice(detectedLocale.length + 1) || '/'

    return { detectedLocale, pathname }
  }

  /**
   * Normalizes the pathname by removing the locale prefix if any.
   *
   * @param pathname The pathname to normalize.
   * @returns The pathname without the locale prefix (if any).
   */
  public normalize(pathname: string): string {
    const match = this.match(pathname, {
      // We aren't using the detected locale, so we can pass `undefined` because
      // we don't need to infer the default locale.
      defaultLocale: undefined,
    })

    return match.pathname
  }
}
