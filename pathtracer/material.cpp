#include "material.h"
#include "sampling.h"
#include "labhelper.h"

using namespace labhelper;

namespace pathtracer
{
WiSample sampleHemisphereCosine(const vec3& wo, const vec3& n)
{
	mat3 tbn = tangentSpace(n);
	vec3 sample = cosineSampleHemisphere();
	WiSample r;
	r.wi = tbn * sample;
	if(dot(r.wi, n) > 0.0f)
		r.pdf = max(0.0f, dot(r.wi, n)) / M_PI;
	return r;
}

///////////////////////////////////////////////////////////////////////////
// A Lambertian (diffuse) material
///////////////////////////////////////////////////////////////////////////
vec3 Diffuse::f(const vec3& wi, const vec3& wo, const vec3& n) const
{
	if(dot(wi, n) <= 0.0f)
		return vec3(0.0f);
	if(!sameHemisphere(wi, wo, n))
		return vec3(0.0f);
	return (1.0f / M_PI) * color;
}

WiSample Diffuse::sample_wi(const vec3& wo, const vec3& n) const
{
	WiSample r = sampleHemisphereCosine(wo, n);
	r.f = f(r.wi, wo, n);
	return r;
}

vec3 MicrofacetBRDF::f(const vec3& wi, const vec3& wo, const vec3& n) const
{
	vec3 wh = normalize(wi + wo);
	float ndotwh = fmax(0.001, dot(n, wh));
	float ndotwo = fmax(0.001, dot(n, wo));
	float wodotwh = fmax(0.001, dot(wo, wh));
	float ndotwi = fmax(0.001, dot(n, wi));
	float D = ((shininess + 2) / (2 * M_PI)) * (pow(ndotwh, shininess));
	float G = fmin(1, min(((2 * ndotwh * ndotwo) / (wodotwh)), ((2 * ndotwh * ndotwi) / (wodotwh))));
	float brdf = (D * G) / (4 * clamp(ndotwo * ndotwi, 0.01f, 1.0f));
	return brdf * ndotwi * vec3(1.0f); 
}

WiSample MicrofacetBRDF::sample_wi(const vec3& wo, const vec3& n) const
{
	WiSample r = sampleHemisphereCosine(wo, n);
	r.f = f(r.wi, wo, n);

	return r;
}


float BSDF::fresnel(const vec3& wi, const vec3& wo) const
{
	vec3 wh = normalize(wi + wo);
	float whdotwi = max(0.0f, dot(wo, wh));
	float F = R0 + (1 - R0) * pow(1 - whdotwi, 5.0);
	return F;
}


vec3 DielectricBSDF::f(const vec3& wi, const vec3& wo, const vec3& n) const
{
	return vec3(1.0f);
	float F = fresnel(wi, wo);
	vec3 bsdf = F * reflective_material->f(wi, wo, n) + (1 - F) * transmissive_material->f(wi, wo, n);
	return bsdf;
}

WiSample DielectricBSDF::sample_wi(const vec3& wo, const vec3& n) const
{
	WiSample r;

	r = sampleHemisphereCosine(wo, n);
	r.f = f(r.wi, wo, n);

	return r;
}

vec3 MetalBSDF::f(const vec3& wi, const vec3& wo, const vec3& n) const
{
	float F = fresnel(wi, wo);
	vec3 bsdf = F * reflective_material->f(wi, wo, n); //CHECK THIS
	return bsdf * color;
}

WiSample MetalBSDF::sample_wi(const vec3& wo, const vec3& n) const
{
	WiSample r;
	r = sampleHemisphereCosine(wo, n);
	r.f = f(r.wi, wo, n);
	return r;
}


vec3 BSDFLinearBlend::f(const vec3& wi, const vec3& wo, const vec3& n) const
{
	vec3 res0 = bsdf0->f(wi, wo, n);
	vec3 res1 = bsdf1->f(wi, wo, n);
	vec3 blend = w * res0 + (1.0f - w) * res1;
	return blend;
}

WiSample BSDFLinearBlend::sample_wi(const vec3& wo, const vec3& n) const
{
	return WiSample{};
}


#if SOLUTION_PROJECT == PROJECT_REFRACTIONS
///////////////////////////////////////////////////////////////////////////
// A perfect specular refraction.
///////////////////////////////////////////////////////////////////////////
vec3 GlassBTDF::f(const vec3& wi, const vec3& wo, const vec3& n) const
{
	if(sameHemisphere(wi, wo, n))
	{
		return vec3(0);
	}
	else
	{
		return vec3(1);
	}
}

WiSample GlassBTDF::sample_wi(const vec3& wo, const vec3& n) const
{
	WiSample r;

	float eta;
	glm::vec3 N;
	if(dot(wo, n) > 0.0f)
	{
		N = n;
		eta = 1.0f / ior;
	}
	else
	{
		N = -n;
		eta = ior;
	}

	// Alternatively:
	// d = dot(wo, N)
	// k = d * d (1 - eta*eta)
	// wi = normalize(-eta * wo + (d * eta - sqrt(k)) * N)

	// or

	// d = dot(n, wo)
	// k = 1 - eta*eta * (1 - d * d)
	// wi = - eta * wo + ( eta * d - sqrt(k) ) * N

	float w = dot(wo, N) * eta;
	float k = 1.0f + (w - eta) * (w + eta);
	if(k < 0.0f)
	{
		// Total internal reflection
		r.wi = reflect(-wo, n);
	}
	else
	{
		k = sqrt(k);
		r.wi = normalize(-eta * wo + (w - k) * N);
	}
	r.pdf = abs(dot(r.wi, n));
	r.f = vec3(1.0f, 1.0f, 1.0f);

	return r;
}

vec3 BTDFLinearBlend::f(const vec3& wi, const vec3& wo, const vec3& n) const
{
	return w * btdf0->f(wi, wo, n) + (1.0f - w) * btdf1->f(wi, wo, n);
}

WiSample BTDFLinearBlend::sample_wi(const vec3& wo, const vec3& n) const
{
	if(randf() < w)
	{
		WiSample r = btdf0->sample_wi(wo, n);
		return r;
	}
	else
	{
		WiSample r = btdf1->sample_wi(wo, n);
		return r;
	}
}

#endif
} // namespace pathtracer
