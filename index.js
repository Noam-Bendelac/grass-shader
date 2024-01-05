


import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  ShaderMaterial,
  Uint16BufferAttribute,
  Vector3,
  WebGLRenderer,
} from 'three'

const scene = new Scene()
const aspect = window.innerWidth / window.innerHeight
const camera = new PerspectiveCamera(40, aspect, 0.1, 1000)

camera.position.set(0, 10, 30)
camera.lookAt(0, 0, 0)

const cameraParent = new Group()
cameraParent.add(camera)
scene.add(cameraParent)

const renderer = new WebGLRenderer({antialias: true})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
$('.container').append(renderer.domElement)




/**
 * intended use: uniformToNormalRand(Math.random())
 * @param uniform 0 to 1 uniform random number
 * @returns normally distributed randome number with mean 0 and stddev 1
 */
function uniformToNormalRand(uniform) {
  // 0 <= uniform <= 1
  const x = 2*uniform - 1
  // -1 <= x <= 1
  return x / Math.sqrt(1 - x*x)
}



const triangleGeo = new BufferGeometry()

const numVert = 3
const pos = new BufferAttribute(Float32Array.of(
  0,    0, -1,
  -0.1, 0, 0,
  0.1,  0, 0,
), 3)

const norm = new Float32BufferAttribute(numVert * 3, 3)
// fill with 0,1,0
norm.array.forEach((_, i) => norm.array[i] = (i % 3 === 1) ? 1. : 0.)

const index = new BufferAttribute(Uint16Array.of(0,1,2), 1)
// const uv = new Float32BufferAttribute(pos.count * 2, 2)

triangleGeo.setIndex(index)
triangleGeo.setAttribute('position', pos)
triangleGeo.setAttribute('normal', norm)
// triangleGeo.setAttribute('uv', uv)


// const singleMesh = new Mesh(triangleGeo, new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }))
// scene.add(singleMesh)


const grassMat = new ShaderMaterial({
  vertexShader: `
    
    varying vec3 f_worldPos;
    varying vec3 f_viewNorm;
    varying vec3 f_viewPos;
    
    void main() {
      mat4 instanceModelMat = modelMatrix * instanceMatrix;
      mat3 normalMat = normalMatrix * transpose(inverse(mat3(instanceMatrix))); //order?
      
      f_viewNorm = normalMat * normal;
      vec4 worldPos = instanceModelMat * vec4(position, 1.);
      f_worldPos = worldPos.xyz;
      vec4 viewPos = viewMatrix * worldPos;
      f_viewPos = viewPos.xyz;
      gl_Position = projectionMatrix * viewPos;
    }
  `,
  fragmentShader: `
    
    varying vec3 f_worldPos;
    varying vec3 f_viewNorm;
    varying vec3 f_viewPos;
    
    
    float sq(float x) {
      return x*x;
    }
    
    
    void main() {
      
      // for now, from the right and above
      vec3 lightDirWorld = normalize(vec3(1,1,0));
      // w=0 means direction not position; disables translation component
      vec3 lightDirView = (viewMatrix * vec4(lightDirWorld, 0.)).xyz;
      
      
      // camera pos in view space is 0,0,0
      // camera vector is from fragment to camera in view space
      vec3 cameraDir = normalize(-f_viewPos);
      
      // frontNorm always faces the camera, backNorm always faces away
      // cameraDir should align with frontNorm
      vec3 frontNorm = normalize(f_viewNorm) * (dot(f_viewNorm, cameraDir) > 0. ? 1. : -1.);
      vec3 backNorm = -frontNorm;
      
      
      // front diffuse reflection color & magnitude
      vec3 albedo = normalize(vec3(0.12, 0.8, 0.1))*0.05;
      // back subsurface scattering color & magnitude
      vec3 subsurface = albedo*0.8;
      
      float glossiness = 30.;
      vec3 specularColor = vec3(1.); // maybe 0.5
      
      
      vec3 directionalLight = vec3(1.0,0.95,0.5) * 10.;
      
      // conditional var
      vec3 directionalLightOut;
      
      float lambertFront = dot(lightDirView, frontNorm);
      if (lambertFront > 0.) {
        // front lit
        
        float lambert = clamp(lambertFront, 0., 1.);
        
        vec3 diffuse = directionalLight * lambert * albedo;
        
        vec3 halfway = normalize(lightDirView + cameraDir);
        vec3 specular = directionalLight * lambert * pow(dot(halfway, frontNorm), glossiness) * sqrt(glossiness) * specularColor;
        
        float metalness = 0.;
        // dot frontNorm with lightDirView or cameraDir?
        float fresnel = mix(metalness, 1., pow(1.-lambert, 5.));
        directionalLightOut = mix(diffuse, specular, fresnel);
      }
      else {
        // back lit
        // == dot(lightDirView, backNorm)
        float lambert = clamp(-lambertFront, 0., 1.);
        // TODO uvs to position shadow correctly
        // pseudorandom shadowY
        float shadowY = f_viewNorm.x;
        float shadowMask = abs(f_worldPos.y - shadowY) < 0.08 ? 0. : 1.;
        // multiply by 1-fresnel?
        vec3 directionalLightIn = directionalLight * shadowMask * lambert;
        directionalLightOut = directionalLightIn * subsurface;
      }
      
      vec3 ambient = vec3(0.65,0.7,1.) * 2.;
      vec3 hemisphereDirView = vec3(0,1,0);
      // TODO specular component of ambient? backside ambient?
      // TODO ambient occlusion approx by height
      // hemisphereIn = cos^2 (0.5 * theta)
      vec3 hemisphereHalfway = normalize(f_viewNorm + hemisphereDirView);
      float hemisphereIn = sq(dot(f_viewNorm, hemisphereHalfway));
      vec3 ambientIn = ambient * hemisphereIn;
      vec3 ambientLightOut = ambient * albedo;
      
      
      vec3 color = directionalLightOut + ambientLightOut;
      
      color = pow(color, vec3(1.0/2.2));
      
      // vec3 color = dot(lightDir, frontNorm) > 0. ? vec3(1,0,0) : vec3(0,1,0);
      
      // vec3 color = vec3(1,1,1);
      gl_FragColor = vec4(color, 1.);
    }
  `,
  side: DoubleSide,
})



const instanced = new InstancedMesh(
  triangleGeo,
  grassMat,
  // new MeshBasicMaterial({ color: new Color(0,1,0), transparent: true, blendDstAlpha: 0.5, side: DoubleSide }),
  100000
)
scene.add(instanced)
const localMatrix = new Matrix4()
const localTrans = new Vector3()
const localRot = new Quaternion()
const localEuler = new Euler()
localEuler.order = 'YXZ'
const localScale = new Vector3()
for (let i = 0; i < instanced.count; i++) {
  localTrans.set(Math.random()-0.5, 0, Math.random()-0.5).multiplyScalar(50)
  // pitch yaw roll
  localEuler.set(
    // pitch is densely distributed around 90deg with stddev 10deg, rectified to stay below 90
    MathUtils.degToRad(MathUtils.clamp(90 - 30*(uniformToNormalRand(Math.random())), 10, 90)),
    // 0 to 360deg
    Math.random()*Math.PI*2,
    // double sided grass so 0 to 180 could work, but might as well 0 to 360
    Math.random()*Math.PI*2,
  )
  localScale.set(1, 1, 1)
  
  localRot.setFromEuler(localEuler)
  localMatrix.compose(localTrans, localRot, localScale)
  // console.log(localMatrix)
  instanced.setMatrixAt(i, localMatrix)
}
// instanced.instanceMatrix.needsUpdate = true




renderer.setClearColor(new Color(0.02, 0.1, 0.02))



let lastTime = document.timeline.currentTime
function animate(currentTime) {
  requestAnimationFrame(animate)
  const deltaT = currentTime - lastTime
  // controls.update()
  cameraParent.rotateY(0.1*deltaT/1000.)
  renderer.render(scene, camera)
  lastTime = currentTime
}

animate(lastTime)



