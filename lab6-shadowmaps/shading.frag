#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

///////////////////////////////////////////////////////////////////////////////
// Material
///////////////////////////////////////////////////////////////////////////////
uniform vec3 material_color;
uniform float material_metalness;
uniform float material_fresnel;
uniform float material_shininess;
uniform vec3 material_emission;

uniform int has_color_texture;
layout(binding = 0) uniform sampler2D colorMap;
uniform int has_emission_texture;
layout(binding = 5) uniform sampler2D emissiveMap;

///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
layout(binding = 6) uniform sampler2D environmentMap;
layout(binding = 7) uniform sampler2D irradianceMap;
layout(binding = 8) uniform sampler2D reflectionMap;
uniform float environment_multiplier;

///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////
uniform vec3 point_light_color = vec3(1.0, 1.0, 1.0);
uniform float point_light_intensity_multiplier = 50.0;

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////
#define PI 3.14159265359

///////////////////////////////////////////////////////////////////////////////
// Input varyings from vertex shader
///////////////////////////////////////////////////////////////////////////////
in vec2 texCoord;
in vec3 viewSpaceNormal;
in vec3 viewSpacePosition;
in vec4 shadowMapCoord;

///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////
uniform mat4 viewInverse;
uniform vec3 viewSpaceLightPosition;

///////////////////////////////////////////////////////////////////////////////
// Output color
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) out vec4 fragmentColor;

uniform mat4 lightMatrix;

//#if SOLUTION_USE_BUILTIN_SHADOW_TEST 
layout(binding = 10) uniform sampler2DShadow shadowMapTex;
//#else 
//layout(binding = 10) uniform sampler2D shadowMapTex;
//#endif

uniform vec3 viewSpaceLightDir;
uniform float spotOuterAngle;
uniform float spotInnerAngle;
uniform float useSpotLight;
uniform float useSoftFalloff;


vec3 calculateDirectIllumiunation(vec3 wo, vec3 n, vec3 base_color)
{
	vec3 direct_illum = base_color;
	float distance_light = length(viewSpaceLightPosition - viewSpacePosition);
	float fo = 1.0 / (distance_light * distance_light);
	vec3 li = point_light_intensity_multiplier * point_light_color * fo;
	vec3 wi = normalize(viewSpaceLightPosition - viewSpacePosition);

	if(dot(wi, n) <= 0) 
		return vec3(0.0);

	vec3 diffuse_term = base_color * (1.0/PI) * dot(n, wi) * li;

	vec3 wh = normalize(wi + wo);
	float ndotwh = max(0.0001, dot(n, wh));
	float ndotwo = max(0.0001, dot(n, wo));
	float ndotwi = max(0.0001, dot(n, wi));
	float wodotwh = max(0.0001, dot(wo, wh));
	float whdotwi = max(0.0001, dot(wh, wi));
	float incidenceAngle = dot(wi, n) / dot(length(wi), length(n));

	float d = ((material_shininess + 2) / (2.0 * PI)) * pow(ndotwh, material_shininess);

	float g = min(1.0, min((2*ndotwh*ndotwo)/wodotwh, (2.0 * ndotwh * ndotwi)/wodotwh));
	
	float f = material_fresnel + (1.0 - material_fresnel) * pow(1 - whdotwi, 5.0);
	//float f = material_fresnel + (1.0 - material_fresnel) * pow(1 - ndotwi, 5.0);

	float det = (4.0 * clamp((ndotwo * ndotwi), 0.0001, 1.0));

	float brdf = (f*d*g)/det;

	vec3 dialectric_term = brdf * ndotwi * li + (1.0 - f) * diffuse_term;
	vec3 metal_term = brdf * base_color * ndotwi * li;

	vec3 microfacet_term = material_metalness * metal_term + (1.0 - material_metalness) * dialectric_term;

	direct_illum = microfacet_term;

	return direct_illum;
}

vec3 calculateIndirectIllumination(vec3 wo, vec3 n, vec3 base_color)
{
		vec3 indirect_illum = vec3(0.f);

	vec3 world_normal = vec3(viewInverse * vec4(n, 0.0));

	float theta = acos(max(-1.0f, min(1.0f, world_normal.y)));
	float phi = atan(world_normal.z, world_normal.x);

	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}

	vec2 lookup = vec2(phi / (2.0 * PI), 1 - theta / PI);
	vec3 li = environment_multiplier * texture(irradianceMap, lookup).rgb;

	vec3 diffuse_term = base_color * (1.0 / PI) * li;

	indirect_illum = diffuse_term;

	vec3 wi = normalize(reflect(-wo, n));
	vec3 wr = normalize(vec3(viewInverse * vec4(wi, 0.0)));

	float theta2 = acos(max(-1.0f, min(1.0f, wr.y)));
	float phi2 = atan(wr.z, wr.x);

	if(phi2 < 0.0f)
	{
		phi2 = phi2 + 2.0f * PI;
	}

	vec2 lookup2 = vec2(phi2 / (2.0 * PI), 1 - theta2 / PI);
	float roughness = sqrt(sqrt((2.0/(material_shininess + 2.0))));
	vec3 li2 = environment_multiplier * textureLod(reflectionMap, lookup2, roughness * 7.0).rgb;
	vec3 wh = normalize(wi + wo);
	float wodotwh = max(0.0, dot(wo, wh));
	float f = material_fresnel + (1.0 - material_fresnel) * pow(1.0 - wodotwh, 5.0);
	vec3 dialectric_term = f * li2 + (1.0 - f) * diffuse_term;
	vec3 metal_term = f * base_color * li2;
	vec3 microfacet_term = material_metalness * metal_term + (1.0 - material_metalness) * dialectric_term;
	
	indirect_illum = microfacet_term;

	return indirect_illum;
}

void main()
{
	float visibility = 1.0;
	float attenuation = 1.0;

	//vec4 shadowMapCoord = lightMatrix * vec4(viewSpacePosition, 1.0);

	//#if SOLUTION_USE_BUILTIN_SHADOW_TEST 
		visibility = textureProj(shadowMapTex, shadowMapCoord);
	//#else
		//float depth = texture(shadowMapTex, shadowMapCoord.xy / shadowMapCoord.w).r;
		//visibility = (depth >= (shadowMapCoord.z / shadowMapCoord.w)) ? 1.0 : 0.0;
	//#endif


	if(useSpotLight == 1) 
	{
		vec3 posToLight = normalize(viewSpaceLightPosition - viewSpacePosition);
		float cosAngle = dot(posToLight, -viewSpaceLightDir);

		if(useSoftFalloff == 0) {
			attenuation = (cosAngle > spotOuterAngle) ? 1.0 : 0.0;
		}
		else {
			attenuation = smoothstep(spotOuterAngle, spotInnerAngle, cosAngle);
		}
		
		visibility *= attenuation;
	}


	vec3 wo = -normalize(viewSpacePosition);
	vec3 n = normalize(viewSpaceNormal);

	vec3 base_color = material_color;
	if(has_color_texture == 1)
	{
		base_color = texture(colorMap, texCoord).rgb;
	}

	// Direct illumination
	vec3 direct_illumination_term = visibility * calculateDirectIllumiunation(wo, n, base_color);

	// Indirect illumination
	vec3 indirect_illumination_term = calculateIndirectIllumination(wo, n, base_color);

	///////////////////////////////////////////////////////////////////////////
	// Add emissive term. If emissive texture exists, sample this term.
	///////////////////////////////////////////////////////////////////////////
	vec3 emission_term = material_emission;
	if(has_emission_texture == 1)
	{
		emission_term = texture(emissiveMap, texCoord).rgb;
	}

	vec3 shading = direct_illumination_term + indirect_illumination_term + emission_term;

	fragmentColor = vec4(shading, 1.0);
	return;
}
